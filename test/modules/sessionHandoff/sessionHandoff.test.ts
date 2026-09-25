import { HANDOFF_TTL_MS, TAKEOVER_WINDOW_MS, type SessionRecord } from '@modules/sessionHandoff/handoffRecord';
import { SessionHandoff, type HandoffStore } from '@modules/sessionHandoff/sessionHandoff';

/** One database shared by every device in a test, with a clock the test moves. */
class FakeDatabase {
    records = new Map<string, SessionRecord | null>();
    listeners = new Map<string, Set<(value: SessionRecord | null) => void>>();
    time = 1_000_000;

    store(): HandoffStore & { online: boolean; frozen: boolean } {
        const db = this;
        return {
            online: false,
            frozen: false,
            now: () => db.time,
            async transact(character, update) {
                await Promise.resolve();
                const next = update(db.records.get(character) ?? null);
                if (next === undefined) return null;
                db.records.set(character, next);
                db.listeners.get(character)?.forEach(listener => listener(next));
                return next;
            },
            watch(character, listener) {
                const set = db.listeners.get(character) ?? new Set();
                db.listeners.set(character, set);
                // A frozen tab hears nothing until it wakes.
                const wrapped = (value: SessionRecord | null) => {
                    if (!this.frozen) listener(value);
                };
                set.add(wrapped);
                wrapped(db.records.get(character) ?? null);
                return () => set.delete(wrapped);
            },
            setOnline(online) {
                this.online = online;
            },
        };
    }
}

let sessionCounter = 0;

function device(db: FakeDatabase, name: string) {
    const applied: number[] = [];
    const state = {trusted: true};
    const handoff = new SessionHandoff({
        deviceId: name,
        newSessionId: () => `${name}-${++sessionCounter}`,
        isTrusted: () => state.trusted,
        apply: roomId => {
            applied.push(roomId);
            handoff.roomChanged(roomId);
        },
        setTimer: (fn, ms) => {
            const id = setTimeout(fn, ms);
            return () => clearTimeout(id);
        },
    });
    const store = db.store();
    handoff.setStore(store);
    return {handoff, applied, state, store};
}

/** Log in: the map restores this device's own last room in the same turn. */
async function login(d: ReturnType<typeof device>, ownRoom: number | null = null) {
    d.handoff.connected();
    d.handoff.sessionStarted('Alice');
    if (ownRoom !== null) d.handoff.roomChanged(ownRoom);
    await vi.advanceTimersByTimeAsync(0);
}

describe('SessionHandoff', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('hands the room to the device that takes the session over', async () => {
        const db = new FakeDatabase();
        const a = device(db, 'phone');
        const b = device(db, 'desktop');

        await login(a, 10);
        a.handoff.roomChanged(11);
        a.handoff.roomChanged(12);

        await login(b, 500);
        // The game drops the phone; it hears only once B has claimed.
        a.handoff.disconnected();
        await a.handoff.sessionEnded();
        await vi.advanceTimersByTimeAsync(0);

        expect(b.applied).toEqual([12]);
    });

    it('notices the takeover from the claim before the socket says so', async () => {
        const db = new FakeDatabase();
        const a = device(db, 'phone');
        const b = device(db, 'desktop');

        await login(a, 10);
        await login(b, 500);
        await vi.advanceTimersByTimeAsync(0);

        expect(b.applied).toEqual([10]);
    });

    it('picks up a room left by a deliberate disconnect earlier', async () => {
        const db = new FakeDatabase();
        const a = device(db, 'phone');
        const b = device(db, 'desktop');

        await login(a, 10);
        a.handoff.roomChanged(42);
        await a.handoff.sessionEnded();
        a.handoff.disconnected();

        db.time += 25 * 60 * 1000;
        await login(b, 500);

        expect(b.applied).toEqual([42]);
    });

    it('ignores a handoff older than the idle timeout', async () => {
        const db = new FakeDatabase();
        const a = device(db, 'phone');
        const b = device(db, 'desktop');

        await login(a, 10);
        await a.handoff.sessionEnded();
        a.handoff.disconnected();

        db.time += HANDOFF_TTL_MS + 1;
        await login(b, 500);
        await vi.advanceTimersByTimeAsync(TAKEOVER_WINDOW_MS);

        expect(b.applied).toEqual([]);
    });

    it('writes nothing from a tab that was in the background', async () => {
        const db = new FakeDatabase();
        const a = device(db, 'phone');
        const b = device(db, 'desktop');

        await login(a, 10);
        a.state.trusted = false;
        await login(b, 500);
        a.handoff.disconnected();
        await a.handoff.sessionEnded();
        await vi.advanceTimersByTimeAsync(TAKEOVER_WINDOW_MS);

        expect(b.applied).toEqual([]);
        expect(db.records.get('Alice')?.handoff).toBeNull();
    });

    it('writes nothing while the map is lost', async () => {
        const db = new FakeDatabase();
        const a = device(db, 'phone');
        const b = device(db, 'desktop');

        await login(a, 10);
        a.handoff.lostChanged(true);
        await login(b, 500);
        await vi.advanceTimersByTimeAsync(TAKEOVER_WINDOW_MS);

        expect(b.applied).toEqual([]);
    });

    it('refuses a handoff from a tab that wakes up after the takeover window', async () => {
        const db = new FakeDatabase();
        const a = device(db, 'phone');
        const b = device(db, 'desktop');

        await login(a, 10);
        a.store.frozen = true;
        await login(b, 500);
        db.time += TAKEOVER_WINDOW_MS + 1;
        await vi.advanceTimersByTimeAsync(TAKEOVER_WINDOW_MS);

        a.store.frozen = false;
        a.handoff.disconnected();
        await a.handoff.sessionEnded();

        expect(b.applied).toEqual([]);
        expect(db.records.get('Alice')?.handoff).toBeNull();
    });

    it('does not move a map that has already moved since login', async () => {
        const db = new FakeDatabase();
        const a = device(db, 'phone');
        const b = device(db, 'desktop');

        await login(a, 10);
        a.store.frozen = true;
        await login(b, 500);
        b.handoff.roomChanged(501);

        a.store.frozen = false;
        a.handoff.disconnected();
        await a.handoff.sessionEnded();
        await vi.advanceTimersByTimeAsync(0);

        expect(db.records.get('Alice')?.handoff?.roomId).toBe(10);
        expect(b.applied).toEqual([]);
    });

    it('does not carry an old handoff past the session that followed it', async () => {
        const db = new FakeDatabase();
        const a = device(db, 'phone');
        const b = device(db, 'desktop');
        const c = device(db, 'tablet');

        await login(a, 10);
        await a.handoff.sessionEnded();
        a.handoff.disconnected();

        await login(b, 20);
        expect(b.applied).toEqual([10]);
        // B plays on, then is taken over while in the background.
        b.state.trusted = false;
        b.handoff.roomChanged(99);

        await login(c, 30);
        await vi.advanceTimersByTimeAsync(TAKEOVER_WINDOW_MS);

        expect(c.applied).toEqual([]);
    });

    it('stays online only while playing or writing', async () => {
        const db = new FakeDatabase();
        const a = device(db, 'phone');

        expect(a.store.online).toBe(false);
        await login(a, 10);
        expect(a.store.online).toBe(true);

        a.handoff.disconnected();
        const ended = a.handoff.sessionEnded();
        expect(a.store.online).toBe(true);
        await ended;
        expect(a.store.online).toBe(false);
    });
});

describe('handoff records', () => {
    it('reads back a record the database stripped of null fields', async () => {
        const { normalizeRecord } = await import('@modules/sessionHandoff/handoffRecord');
        expect(normalizeRecord({session: 's', device: 'd', claimedAt: 5})).toEqual({
            session: 's', device: 'd', claimedAt: 5, prevSession: null, handoff: null,
        });
        expect(normalizeRecord(null)).toBeNull();
        expect(normalizeRecord({device: 'd'})).toBeNull();
    });

    it('makes a safe database key from a character name', async () => {
        const { characterKey } = await import('@modules/sessionHandoff/handoffRecord');
        expect(characterKey(' Alice ')).toBe('alice');
        expect(characterKey('a.b/c')).toBe('a_b_c');
    });
});
