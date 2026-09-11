import initSunTracker, {
    clearEventsForDomain,
    getEventsForDomain,
} from '@client/scripts/sunTracker';

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
