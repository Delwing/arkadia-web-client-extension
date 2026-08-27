vi.mock('@client/main', () => ({__esModule: true}));

vi.mock('@client/sounds', () => ({__esModule: true, beepSound: 'mock-sound'}));

vi.mock('@modules/core/customSounds', () => ({
    __esModule: true,
    getCustomSound: vi.fn().mockResolvedValue(undefined),
    getCustomSounds: vi.fn().mockResolvedValue([]),
}));

import Client from '@client/Client';
import eventBus from '@modules/core/eventBus';

/**
 * The session proxy replays output that arrived while the tab was frozen, so a line can
 * reach the trigger pipeline minutes after the game produced it. `client.now()` is what
 * lets a script record when something *happened* rather than when the browser got round
 * to reading it — the difference between a combat timer that has already expired and one
 * that starts a fresh countdown for a fight that is long over.
 */
describe('event clock', () => {
    const adapter = {
        send: vi.fn(),
        output: vi.fn(),
        sendGmcp: vi.fn(),
        flushMessageBuffer: vi.fn(),
        emit: vi.fn(),
        shouldEchoCommand: vi.fn(() => false),
    };

    let client: Client;

    beforeEach(() => {
        vi.clearAllMocks();
        client = new Client(adapter as any);
    });

    afterEach(() => {
        eventBus.removeAllListeners?.();
    });

    it('falls back to the wall clock outside line processing', () => {
        const before = Date.now();

        const now = client.now();

        expect(now).toBeGreaterThanOrEqual(before);
        expect(now).toBeLessThanOrEqual(Date.now());
    });

    it('reports the server timestamp while processing a replayed line', () => {
        const happenedAt = Date.now() - 5 * 60_000;
        let seen: number | undefined;

        client.Triggers.registerTrigger(/Zaczynasz walczyc/, (line) => {
            seen = client.now();
            return line;
        }, 'event-clock-test');

        client.onLine('Zaczynasz walczyc z goblinem.', 'text', happenedAt);

        expect(seen).toBe(happenedAt);
    });

    it('uses the wall clock for live output, which carries no timestamp', () => {
        const before = Date.now();
        let seen: number | undefined;

        client.Triggers.registerTrigger(/Zaczynasz walczyc/, (line) => {
            seen = client.now();
            return line;
        }, 'event-clock-test');

        client.onLine('Zaczynasz walczyc z goblinem.', 'text');

        expect(seen).toBeGreaterThanOrEqual(before);
    });

    it('does not leak an old timestamp into the next line', () => {
        const happenedAt = Date.now() - 5 * 60_000;
        const seen: number[] = [];

        client.Triggers.registerTrigger(/Zaczynasz walczyc/, (line) => {
            seen.push(client.now());
            return line;
        }, 'event-clock-test');

        client.onLine('Zaczynasz walczyc z goblinem.', 'text', happenedAt);
        client.onLine('Zaczynasz walczyc z orkiem.', 'text');

        expect(seen[0]).toBe(happenedAt);
        // A replayed batch is followed by live output; carrying the old time forward
        // would mis-date everything that came after.
        expect(seen[1]).toBeGreaterThan(happenedAt);
    });

    it('restores the clock even when a trigger throws', () => {
        const happenedAt = Date.now() - 60_000;

        client.Triggers.registerTrigger(/wybuchowa/, () => {
            throw new Error('trigger exploded');
        }, 'event-clock-test');

        client.onLine('Linia wybuchowa.', 'text', happenedAt);

        expect(client.now()).toBeGreaterThan(happenedAt);
    });
});
