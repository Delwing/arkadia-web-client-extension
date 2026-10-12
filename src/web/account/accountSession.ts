import {
    type AccountInfo,
    type AccountOptions,
    type AccountReply,
    type CharCreateRequest,
    capitalize,
    decodeGameText,
    encodeGamePayload,
    isValidName,
    normalizeInfo,
    normalizeOptions,
} from "@web/account/accountProtocol.ts";

/*
The account screens' state, and the conversation with the game behind them.

UI-free: the login card (main.ts) and the React screens (AccountScreen.tsx)
both read it through subscribe/getState, and it reaches the game only through
the port. While it is active the login card stays up over a live connection,
because a socket logged into an account has no character in the world yet.
*/

export interface AccountPort {
    sendGmcp(path: string, payload?: string): void;
    /** Listen to one GMCP path; returns the unsubscribe. */
    onGmcp(path: string, listener: (value: unknown) => void): () => void;
    /** Run once the game takes requests, connecting first when there is no connection. */
    whenReady(run: () => void): void;
    /** Drop the connection, if there is one. */
    disconnect(): void;
}

/** Off: the plain login card. Otherwise one of the screens that replace it. */
export type AccountView = 'off' | 'create-account' | 'account';
export type AccountTab = 'chars' | 'create' | 'settings';
export type NoticeScope = 'create-account' | 'welcome' | 'chars' | 'create' | 'email' | 'password' | 'block';

export interface AccountNotice {
    variant: 'success' | 'danger';
    text: string;
}

export interface AccountState {
    view: AccountView;
    tab: AccountTab;
    /** A request is out and its answer awaited; the screens hold still meanwhile. */
    busy: boolean;
    /** Set while an e-mail login waits for its answer on the plain card. */
    loggingIn: boolean;
    info: AccountInfo | null;
    options: AccountOptions | null;
    notices: Partial<Record<NoticeScope, AccountNotice>>;
    /** What the game said about the name being typed, or null while it has no objection. */
    nameError: string | null;
}

const INITIAL: AccountState = {
    view: 'off',
    tab: 'chars',
    busy: false,
    loggingIn: false,
    info: null,
    options: null,
    notices: {},
    nameError: null,
};

/** How long the name may rest before the game is asked about it, as the original does. */
const NAME_CHECK_DELAY_MS = 1000;

export interface AccountSessionCallbacks {
    /** The e-mail login was refused: the card shows the game's words. */
    onLoginFailed?(message: string): void;
    /** A character is in the world: the card can go. */
    onEnteredGame?(): void;
}

export class AccountSession {
    private state: AccountState = INITIAL;
    private readonly listeners = new Set<() => void>();
    private readonly unsubscribers: Array<() => void> = [];
    private nameTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly port: AccountPort, private readonly callbacks: AccountSessionCallbacks = {}) {
        const on = (path: string, handler: (reply: AccountReply) => void) => {
            this.unsubscribers.push(port.onGmcp(path, (value) => {
                handler((value && typeof value === 'object' ? value : {}) as AccountReply);
            }));
        };
        on('account.login', (reply) => this.onAccountLogin(reply));
        on('account.create', (reply) => this.onAccountCreate(reply));
        on('account.info', (reply) => {
            if (this.state.view !== 'account') return;
            this.set({info: normalizeInfo(reply)});
        });
        on('account.options', (reply) => {
            if (this.state.view !== 'account') return;
            this.set({options: normalizeOptions(reply)});
        });
        on('account.check_name', (reply) => {
            if (this.state.view !== 'account' || reply.status !== 'fail' || !reply.msg) return;
            this.set({nameError: decodeGameText(reply.msg)});
        });
        on('account.change.email', (reply) => this.answer('email', reply, () => {
            this.port.sendGmcp('account.info');
            return `Adres e-mail został zmieniony na ${decodeGameText(reply.new_email)}.`;
        }));
        on('account.change.password', (reply) => this.answer('password', reply, () => 'Hasło zostało zmienione.'));
        on('account.block', (reply) => this.answer('block', reply, () => {
            this.patchInfo({blocked: true});
            return 'Konto zostało zablokowane.';
        }));
        on('account.unblock', (reply) => this.answer('block', reply, () => {
            this.patchInfo({blocked: false});
            return 'Konto zostało odblokowane.';
        }));
        on('char.login', (reply) => this.onEnterGame('chars', reply));
        on('char.create', (reply) => this.onEnterGame('create', reply));
        on('char.block', (reply) => this.onCharBlock(reply, true));
        on('char.unblock', (reply) => this.onCharBlock(reply, false));
    }

    // ── reading ──────────────────────────────────────────────────────────

    getState = (): AccountState => this.state;

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    /** True while the card has to stay up over a connection. */
    isActive(): boolean {
        return this.state.view !== 'off' || this.state.loggingIn;
    }

    // ── from the login card ──────────────────────────────────────────────

    login(email: string, password: string): void {
        this.set({...INITIAL, loggingIn: true});
        this.port.whenReady(() => this.port.sendGmcp('account.login', encodeGamePayload({email, password})));
    }

    openCreateAccount(): void {
        this.set({...INITIAL, view: 'create-account'});
    }

    createAccount(email: string): void {
        this.set({busy: true, notices: {}});
        this.port.whenReady(() => this.port.sendGmcp('account.create', encodeGamePayload({email})));
    }

    /** Back to the plain card, dropping the connection that served the account. */
    leave(): void {
        this.reset();
        this.port.disconnect();
    }

    /** The connection is gone: whatever the screens held went with it. */
    reset(): void {
        this.clearNameTimer();
        this.set(INITIAL);
    }

    // ── on the account ───────────────────────────────────────────────────

    setTab(tab: AccountTab): void {
        this.set({tab});
    }

    dismissNotice(scope: NoticeScope): void {
        if (!this.state.notices[scope]) return;
        const notices = {...this.state.notices};
        delete notices[scope];
        this.set({notices});
    }

    /** The error the form shows itself, before anything goes to the game. */
    reject(scope: NoticeScope, text: string): void {
        this.set({notices: {...this.state.notices, [scope]: {variant: 'danger', text}}});
    }

    loginChar(name: string): void {
        this.request('chars', 'char.login', {name});
    }

    setCharBlocked(name: string, blocked: boolean): void {
        this.request('chars', blocked ? 'char.block' : 'char.unblock', {name});
    }

    /** The name being typed: the game is asked about it once typing rests. */
    checkName(name: string): void {
        this.clearNameTimer();
        if (this.state.nameError) this.set({nameError: null});
        if (!name) return;
        if (!isValidName(name)) {
            this.set({nameError: 'Imię zawiera niedozwolone znaki.'});
            return;
        }
        this.nameTimer = setTimeout(() => {
            this.nameTimer = null;
            this.port.sendGmcp('account.check_name', encodeGamePayload({name}));
        }, NAME_CHECK_DELAY_MS);
    }

    createChar(request: CharCreateRequest): void {
        this.request('create', 'char.create', request);
    }

    changeEmail(password: string, newEmail: string): void {
        this.request('email', 'account.change.email', {password, new_email: newEmail});
    }

    changePassword(oldPassword: string, newPassword: string): void {
        this.request('password', 'account.change.password', {old_password: oldPassword, new_password: newPassword});
    }

    /** `until` in unix seconds. */
    blockAccount(until: number, password: string): void {
        this.request('block', 'account.block', {time: until, password});
    }

    unblockAccount(): void {
        this.dismissNotice('block');
        this.set({busy: true});
        this.port.sendGmcp('account.unblock');
    }

    dispose(): void {
        this.clearNameTimer();
        this.unsubscribers.splice(0).forEach((off) => off());
        this.listeners.clear();
    }

    // ── answers ──────────────────────────────────────────────────────────

    private onAccountLogin(reply: AccountReply): void {
        if (!this.state.loggingIn) return;
        if (reply.status === 'fail') {
            this.set({loggingIn: false});
            this.callbacks.onLoginFailed?.(decodeGameText(reply.msg) || 'Nie udało się zalogować na konto.');
            return;
        }
        if (reply.status !== 'success') return;
        this.set({...INITIAL, view: 'account', tab: 'chars'});
        this.port.sendGmcp('account.info');
        this.port.sendGmcp('account.options');
    }

    private onAccountCreate(reply: AccountReply): void {
        if (this.state.view !== 'create-account') return;
        if (reply.status === 'fail') {
            this.set({busy: false, notices: {'create-account': {variant: 'danger', text: decodeGameText(reply.msg) || 'Nie udało się założyć konta.'}}});
            return;
        }
        if (reply.status !== 'success') return;
        const email = decodeGameText(reply.email);
        this.set({
            ...INITIAL,
            view: 'account',
            tab: 'create',
            notices: {
                welcome: {
                    variant: 'success',
                    text: `Za chwilę${email ? ` na adres ${email}` : ''} otrzymasz e-mail z hasłem do logowania. Już teraz możesz stworzyć swoją postać.`,
                },
            },
        });
        this.port.sendGmcp('account.info');
        this.port.sendGmcp('account.options');
    }

    private onEnterGame(scope: NoticeScope, reply: AccountReply): void {
        if (this.state.view !== 'account') return;
        if (reply.status === 'fail') {
            this.fail(scope, reply);
            return;
        }
        if (reply.status !== 'success') return;
        this.reset();
        this.callbacks.onEnteredGame?.();
    }

    private onCharBlock(reply: AccountReply, blocked: boolean): void {
        if (this.state.view !== 'account') return;
        if (reply.status === 'fail') {
            this.fail('chars', reply);
            return;
        }
        if (reply.status !== 'success' || typeof reply.name !== 'string') return;
        const name = reply.name;
        const info = this.state.info;
        this.set({
            busy: false,
            info: info && {...info, chars: info.chars.map((c) => (c.name === name ? {...c, blocked} : c))},
            notices: {
                ...this.state.notices,
                chars: {variant: 'success', text: `Postać ${capitalize(name)} została ${blocked ? 'zablokowana' : 'odblokowana'}.`},
            },
        });
    }

    /** A plain success-or-fail answer for one section of the account. */
    private answer(scope: NoticeScope, reply: AccountReply, onSuccess: () => string): void {
        if (this.state.view !== 'account') return;
        if (reply.status === 'fail') {
            this.fail(scope, reply);
            return;
        }
        if (reply.status !== 'success') return;
        const text = onSuccess();
        this.set({busy: false, notices: {...this.state.notices, [scope]: {variant: 'success', text}}});
    }

    private fail(scope: NoticeScope, reply: AccountReply): void {
        const text = decodeGameText(reply.msg) || 'Gra odrzuciła to żądanie.';
        this.set({busy: false, notices: {...this.state.notices, [scope]: {variant: 'danger', text}}});
    }

    // ── plumbing ─────────────────────────────────────────────────────────

    private request(scope: NoticeScope, path: string, payload: unknown): void {
        this.dismissNotice(scope);
        this.set({busy: true});
        this.port.sendGmcp(path, encodeGamePayload(payload));
    }

    private patchInfo(patch: Partial<AccountInfo>): void {
        if (this.state.info) this.set({info: {...this.state.info, ...patch}});
    }

    private clearNameTimer(): void {
        if (this.nameTimer) clearTimeout(this.nameTimer);
        this.nameTimer = null;
    }

    private set(patch: Partial<AccountState>): void {
        this.state = {...this.state, ...patch};
        this.listeners.forEach((listener) => listener());
    }
}
