import initIdleLogout, { IDLE_WARNING_MS } from '@client/scripts/idleLogout';
import { setGmcp } from '@client/gmcp';

function setup(maxIdleMinutes: number | null = 30) {
    setGmcp('char.options', maxIdleMinutes === null ? {} : { max_idle_time: maxIdleMinutes });
    const handlers: Record<string, () => void> = {};
    const client: any = {
        on: (event: string, handler: () => void) => { handlers[event] = handler; },
        sendEvent: jest.fn(),
    };
    initIdleLogout(client);
    const notifies = () => client.sendEvent.mock.calls.filter(([e]: [string]) => e === 'notify').map(([, p]: [string, any]) => p);
    const dismissed = () => client.sendEvent.mock.calls.some(([e, p]: [string, any]) => e === 'notify.dismiss' && p.key === 'idle.logout');
    return { handlers, client, notifies, dismissed };
}

describe('idleLogout', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('warns a minute before the idle limit, counting down', () => {
        const { handlers, notifies } = setup(30);
        handlers['client.connect']();

        jest.advanceTimersByTime(29 * 60_000 - 1);
        expect(notifies()).toHaveLength(0);

        jest.advanceTimersByTime(1);
        expect(notifies()[0]).toMatchObject({
            key: 'idle.logout',
            sticky: true,
            level: 'warning',
            title: 'Czas do wylogowania przez nieaktywność',
            progress: { value: IDLE_WARNING_MS, max: IDLE_WARNING_MS },
            system: true,
        });

        jest.advanceTimersByTime(30_000);
        const last = notifies().at(-1);
        expect(last).toMatchObject({ update: true, system: false, progress: { value: 30_000 } });
        expect(last.text).toContain('0:30');
    });

    test('a line sent to the game clears the warning and restarts the clock', () => {
        const { handlers, notifies, dismissed } = setup(30);
        handlers['client.connect']();
        jest.advanceTimersByTime(29 * 60_000 + 10_000);
        expect(notifies().length).toBeGreaterThan(0);

        handlers['socket.sent']();
        expect(dismissed()).toBe(true);

        const shownBefore = notifies().length;
        jest.advanceTimersByTime(28 * 60_000);
        expect(notifies()).toHaveLength(shownBefore);
    });

    test('disconnecting clears the warning and stops counting', () => {
        const { handlers, notifies, dismissed } = setup(30);
        handlers['client.connect']();
        jest.advanceTimersByTime(29 * 60_000 + 1000);
        handlers['client.disconnect']();
        expect(dismissed()).toBe(true);

        const shownBefore = notifies().length;
        jest.advanceTimersByTime(10 * 60_000);
        expect(notifies()).toHaveLength(shownBefore);
    });

    test('says nothing until the game tells the limit', () => {
        const { handlers, notifies } = setup(null);
        handlers['client.connect']();
        jest.advanceTimersByTime(60_000);
        expect(notifies()).toHaveLength(0);

        // Counted from the login, not from when the limit arrived.
        setGmcp('char.options', { max_idle_time: 5 });
        handlers['gmcp.char.options']();
        jest.advanceTimersByTime(3 * 60_000 - 1);
        expect(notifies()).toHaveLength(0);
        jest.advanceTimersByTime(1);
        expect(notifies()).toHaveLength(1);
    });

    test('stops counting at zero', () => {
        const { handlers, notifies } = setup(30);
        handlers['client.connect']();
        jest.advanceTimersByTime(30 * 60_000);
        const atZero = notifies().length;
        expect(notifies().at(-1).progress.value).toBe(0);
        jest.advanceTimersByTime(10_000);
        expect(notifies()).toHaveLength(atZero);
    });

    test('an unrelated options update does not restart a warning on screen', () => {
        const { handlers, notifies, dismissed } = setup(30);
        handlers['client.connect']();
        jest.advanceTimersByTime(29 * 60_000);
        handlers['gmcp.char.options']();
        expect(dismissed()).toBe(false);
        expect(notifies().filter(n => n.system)).toHaveLength(1);
    });
});
