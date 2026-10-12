import {AccountSession, type AccountPort} from '@web/account/accountSession.ts';

function harness() {
    const listeners = new Map<string, Set<(value: unknown) => void>>();
    const sent: Array<{path: string; payload: unknown}> = [];
    let ready: (() => void) | null = null;
    const port: AccountPort = {
        sendGmcp: (path, payload) => sent.push({path, payload: payload ? JSON.parse(payload) : undefined}),
        onGmcp: (path, listener) => {
            if (!listeners.has(path)) listeners.set(path, new Set());
            listeners.get(path)!.add(listener);
            return () => listeners.get(path)!.delete(listener);
        },
        whenReady: (run) => { ready = run; },
        disconnect: jest.fn(),
    };
    const callbacks = {onLoginFailed: jest.fn(), onEnteredGame: jest.fn()};
    const session = new AccountSession(port, callbacks);
    const reply = (path: string, value: unknown) => listeners.get(path)?.forEach((l) => l(value));
    const connect = () => { ready?.(); ready = null; };
    return {session, sent, reply, connect, port, callbacks};
}

describe('AccountSession', () => {
    it('logs in by e-mail once the game is ready, then asks for the account', () => {
        const {session, sent, reply, connect} = harness();
        session.login('a@b.pl', 'haslo');
        expect(session.isActive()).toBe(true);
        expect(sent).toEqual([]);
        connect();
        expect(sent).toEqual([{path: 'account.login', payload: {email: 'a@b.pl', password: 'haslo'}}]);

        reply('account.login', {status: 'success'});
        expect(session.getState().view).toBe('account');
        expect(sent.slice(1).map((s) => s.path)).toEqual(['account.info', 'account.options']);

        reply('account.info', {email: 'a@b.pl', chars: [{name: 'dargoth'}]});
        expect(session.getState().info?.chars).toEqual([{name: 'dargoth', blocked: false}]);
    });

    it("hands a refused login's message back to the card", () => {
        const {session, reply, connect, callbacks} = harness();
        session.login('a@b.pl', 'zle');
        connect();
        reply('account.login', {status: 'fail', code: 14, msg: 'Złe hasło.'});
        expect(callbacks.onLoginFailed).toHaveBeenCalledWith('Złe hasło.');
        expect(session.isActive()).toBe(false);
    });

    it('ignores account answers nobody asked for', () => {
        const {session, reply} = harness();
        reply('account.login', {status: 'success'});
        reply('account.info', {chars: []});
        expect(session.getState().view).toBe('off');
        expect(session.getState().info).toBeNull();
    });

    it('creates an account and opens the new character form with a welcome', () => {
        const {session, sent, reply, connect} = harness();
        session.openCreateAccount();
        session.createAccount('nowy@b.pl');
        connect();
        expect(sent[0]).toEqual({path: 'account.create', payload: {email: 'nowy@b.pl'}});

        reply('account.create', {status: 'fail', msg: 'Zajęty.'});
        expect(session.getState().view).toBe('create-account');
        expect(session.getState().notices['create-account']).toEqual({variant: 'danger', text: 'Zajęty.'});

        reply('account.create', {status: 'success', email: 'nowy@b.pl'});
        const state = session.getState();
        expect(state.view).toBe('account');
        expect(state.tab).toBe('create');
        expect(state.notices.welcome?.text).toContain('nowy@b.pl');
    });

    async function loggedIn() {
        const h = harness();
        h.session.login('a@b.pl', 'x');
        h.connect();
        h.reply('account.login', {status: 'success'});
        h.reply('account.info', {chars: [{name: 'dargoth'}, {name: 'xen'}]});
        h.sent.length = 0;
        return h;
    }

    it('enters the game with a character and lets the card go', async () => {
        const {session, sent, reply, callbacks} = await loggedIn();
        session.loginChar('dargoth');
        expect(sent).toEqual([{path: 'char.login', payload: {name: 'dargoth'}}]);
        expect(session.getState().busy).toBe(true);
        reply('char.login', {status: 'success'});
        expect(callbacks.onEnteredGame).toHaveBeenCalled();
        expect(session.isActive()).toBe(false);
    });

    it('marks a character blocked when the game agrees', async () => {
        const {session, sent, reply} = await loggedIn();
        session.setCharBlocked('xen', true);
        expect(sent).toEqual([{path: 'char.block', payload: {name: 'xen'}}]);
        reply('char.block', {status: 'success', name: 'xen'});
        expect(session.getState().info?.chars).toEqual([{name: 'dargoth', blocked: false}, {name: 'xen', blocked: true}]);
        expect(session.getState().notices.chars?.text).toBe('Postać Xen została zablokowana.');
    });

    it('sends a new character as the original client does, and shows a refusal', async () => {
        const {session, sent, reply} = await loggedIn();
        session.createChar({
            name_declension: ['Ab', 'Aba', 'Abowi', 'Aba', 'Abem', 'Abie'],
            race: 1,
            gender: 0,
            adjectives: ['łysy', 'wysoki'],
            startloc: 0,
        });
        expect(sent[0].path).toBe('char.create');
        expect(sent[0].payload).toEqual({
            name_declension: ['Ab', 'Aba', 'Abowi', 'Aba', 'Abem', 'Abie'],
            race: 1,
            gender: 0,
            // JSON.parse of the byte string: the UTF-8 bytes stand one per char.
            adjectives: ['Å\u0082ysy', 'wysoki'],
            startloc: 0,
        });
        reply('char.create', {status: 'fail', msg: 'Imie zajete.'});
        expect(session.getState().notices.create).toEqual({variant: 'danger', text: 'Imie zajete.'});
        expect(session.getState().busy).toBe(false);
    });

    it('checks a name once typing rests, and shows what the game says', async () => {
        jest.useFakeTimers();
        try {
            const {session, sent, reply} = await loggedIn();
            session.checkName('Ab');
            session.checkName('Abc');
            expect(sent).toEqual([]);
            jest.advanceTimersByTime(1000);
            expect(sent).toEqual([{path: 'account.check_name', payload: {name: 'Abc'}}]);
            reply('account.check_name', {status: 'fail', msg: 'Imie zajete.'});
            expect(session.getState().nameError).toBe('Imie zajete.');
            session.checkName('Abcd');
            expect(session.getState().nameError).toBeNull();
            session.checkName('Ab1');
            expect(session.getState().nameError).toBe('Imię zawiera niedozwolone znaki.');
        } finally {
            jest.useRealTimers();
        }
    });

    it('blocks and unblocks the account', async () => {
        const {session, sent, reply} = await loggedIn();
        session.blockAccount(1_800_000_000, 'x');
        expect(sent[0]).toEqual({path: 'account.block', payload: {time: 1_800_000_000, password: 'x'}});
        reply('account.block', {status: 'success'});
        expect(session.getState().info?.blocked).toBe(true);
        session.unblockAccount();
        expect(sent[1]).toEqual({path: 'account.unblock', payload: undefined});
        reply('account.unblock', {status: 'success'});
        expect(session.getState().info?.blocked).toBe(false);
    });

    it('logging out drops the connection and the state', async () => {
        const {session, port} = await loggedIn();
        session.leave();
        expect(port.disconnect).toHaveBeenCalled();
        expect(session.getState().view).toBe('off');
        expect(session.getState().info).toBeNull();
    });
});
