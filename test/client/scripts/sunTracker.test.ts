import initSunTracker, {
    clearEventsForDomain,
    getEventsForDomain,
} from '@client/scripts/sunTracker';
import { characterStorage } from "@modules/core/storage";

/**
 * The grids in `sunModel` are fitted against what this tracker records, and the
 * clock now corrects itself from those same grids. That is only safe while the
 * recording stays independent of the model - otherwise the clock would be feeding
 * its own assumptions back into the evidence and every observation would confirm
 * whatever the grid already said.
 *
 * The seam is `clock.parsedTime`: the sun event only opens a pending observation,
 * and what actually gets stored is the hour the game spelled out in its `czas`
 * reply. These tests pin that down.
 */
describe('sunTracker records the game, not the model', () => {
    let handlers: Record<string, (data: any) => void>;
    let client: any;

    /**
     * The store happens off an un-awaitable handler, so poll rather than trusting a
     * single microtask flush to have carried an IndexedDB transaction to completion.
     */
    async function eventsSettlingAt(count: number) {
        for (let i = 0; i < 50; i++) {
            const events = await getEventsForDomain('Empire');
            if (events.length === count) return events;
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        return getEventsForDomain('Empire');
    }

    beforeEach(async () => {
        handlers = {};
        client = {
            on: (event: string, handler: (data: any) => void) => { handlers[event] = handler; },
            print: jest.fn(),
            sendCommand: jest.fn(),
            sendEvent: jest.fn(),
            now: () => 1_700_000_000_000,
            aliases: [],
        };
        await clearEventsForDomain('Empire');
        initSunTracker(client);
    });

    afterEach(async () => {
        await clearEventsForDomain('Empire');
    });

    test('stores the hour from the czas reply, not the one the clock announced', async () => {
        // The clock announces its corrected (grid) hour...
        handlers['clock.sunrise']({ domain: 'Empire', dayOfYear: 25, observedHour: 7 });
        // ...but the game's own reply is what settles it.
        handlers['clock.parsedTime']({ domain: 'Empire', hour: 8, dayOfYear: 25 });
        const events = await eventsSettlingAt(1);
        expect(events).toHaveLength(1);
        expect(events[0].observedHour).toBe(8);
        expect(events[0].type).toBe('sunrise');
    });

    test('stores the day from the czas reply too', async () => {
        handlers['clock.sunset']({ domain: 'Empire', dayOfYear: 100, observedHour: 20 });
        handlers['clock.parsedTime']({ domain: 'Empire', hour: 19, dayOfYear: 101 });
        const events = await eventsSettlingAt(1);
        expect(events).toHaveLength(1);
        expect(events[0].dayOfYear).toBe(101);
        expect(events[0].observedHour).toBe(19);
    });

    test('an unconfirmed sun event records nothing at all', async () => {
        // No `czas` follows, so there is no evidence - and a guess from the grid
        // is exactly what must not be written down.
        handlers['clock.sunrise']({ domain: 'Empire', dayOfYear: 25, observedHour: 7 });

        expect(await eventsSettlingAt(1)).toHaveLength(0);
    });

    test('a czas with no sun event pending records nothing', async () => {
        handlers['clock.parsedTime']({ domain: 'Empire', hour: 8, dayOfYear: 25 });

        expect(await eventsSettlingAt(1)).toHaveLength(0);
    });

    test('/slonce is still registered as the way in', () => {
        const patterns = client.aliases.map((a: any) => a.pattern.source);
        expect(patterns).toContain(/^\/slonce$/.source);
    });
});

describe('sunTracker announces the sky', () => {
    function setup(settings: Record<string, unknown>) {
        localStorage.clear();
        characterStorage.set('settings', settings as any);
        const handlers: Record<string, (data: any) => void> = {};
        const client: any = {
            on: (event: string, handler: (data: any) => void) => { handlers[event] = handler; },
            print: jest.fn(),
            sendCommand: jest.fn(),
            sendEvent: jest.fn(),
            now: () => 1_700_000_000_000,
            aliases: [],
        };
        initSunTracker(client);
        return { handlers, client };
    }

    test('as a notification with the sun, even before any czas', () => {
        const { handlers, client } = setup({ sunAnnouncement: 'notification' });
        handlers['clock.daylightChange']({ domain: 'Empire', type: 'sunrise' });

        expect(client.sendEvent).toHaveBeenCalledWith('notify', expect.objectContaining({
            title: 'Wschód słońca',
            text: 'Imperium',
            icon: 'sun',
            source: 'clock',
        }));
        const payload = client.sendEvent.mock.calls.find(([e]: [string]) => e === 'notify')[1];
        expect(payload.actions).toBeUndefined();
        expect(client.print).not.toHaveBeenCalled();
    });

    test('a sunset gets the moon', () => {
        const { handlers, client } = setup({ sunAnnouncement: 'notification' });
        handlers['clock.daylightChange']({ domain: 'Ishtar', type: 'sunset' });
        expect(client.sendEvent).toHaveBeenCalledWith('notify', expect.objectContaining({ icon: 'moon', title: 'Zachód słońca' }));
    });

    test('as the frame in the output when that is the choice', () => {
        const { handlers, client } = setup({ sunAnnouncement: 'frame' });
        handlers['clock.daylightChange']({ domain: 'Empire', type: 'sunset' });

        expect(client.print).toHaveBeenCalledTimes(3);
        expect(client.print.mock.calls[1][0].text).toContain('ZACHOD');
        expect(client.sendEvent).not.toHaveBeenCalledWith('notify', expect.anything());
    });

    test('settings not yet migrated still read the old switch as frames', () => {
        const { handlers, client } = setup({ sunTracker: true });
        handlers['clock.daylightChange']({ domain: 'Empire', type: 'sunrise' });
        expect(client.print).toHaveBeenCalledTimes(3);
    });

    test('the clock placing the flip later does not announce it twice', () => {
        const { handlers, client } = setup({ sunAnnouncement: 'notification' });
        handlers['clock.sunset']({ domain: 'Empire', dayOfYear: 100, observedHour: 20 });
        expect(client.sendEvent).not.toHaveBeenCalledWith('notify', expect.anything());
        expect(client.print).not.toHaveBeenCalled();
    });

    test('stays quiet when off', () => {
        const { handlers, client } = setup({ sunAnnouncement: 'off' });
        handlers['clock.daylightChange']({ domain: 'Ishtar', type: 'sunset' });
        expect(client.sendEvent).not.toHaveBeenCalledWith('notify', expect.anything());
        expect(client.print).not.toHaveBeenCalled();
    });
});

test('sunrise and sunset are separate toasts, not repeats of one', () => {
    localStorage.clear();
    characterStorage.set('settings', { sunAnnouncement: 'notification' } as any);
    const handlers: Record<string, (data: any) => void> = {};
    const client: any = { on: (e: string, h: any) => { handlers[e] = h; }, print: jest.fn(), sendCommand: jest.fn(), sendEvent: jest.fn(), now: () => 0, aliases: [] };
    initSunTracker(client);
    handlers['clock.daylightChange']({ domain: 'Empire', type: 'sunrise' });
    handlers['clock.daylightChange']({ domain: 'Empire', type: 'sunset' });
    const keys = client.sendEvent.mock.calls.filter(([e]: [string]) => e === 'notify').map(([, p]: [string, any]) => p.key);
    expect(new Set(keys).size).toBe(2);
});
