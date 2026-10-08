import { PluginApiImpl } from '@client/PluginApi';

const listeners = new Set<(people: unknown[] | undefined) => void>();
const refresh = vi.fn().mockResolvedValue(undefined);

vi.mock('@modules/data/peopleLoader', async () => ({
    ...(await vi.importActual<object>('@modules/data/peopleLoader')),
    subscribeMerged: (listener: (people: unknown[] | undefined) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
    refresh: () => refresh(),
}));

const person = { name: 'Borin', description: 'brodaty krasnolud', guild: '' };

describe('plugin people API', () => {
    beforeEach(() => listeners.clear());

    test('subscribe passes every change on until unsubscribed', () => {
        const api = new PluginApiImpl({} as never, 'test/people');
        const seen: unknown[][] = [];
        const off = api.people.subscribe(people => seen.push(people));

        listeners.forEach(l => l([person]));
        listeners.forEach(l => l(undefined));
        off();
        listeners.forEach(l => l([]));

        expect(seen).toEqual([[person], []]);
        expect(listeners.size).toBe(0);
    });

    test('unloading the plugin ends its subscriptions', () => {
        const api = new PluginApiImpl({} as never, 'test/people');
        api.people.subscribe(() => undefined);
        api.people.subscribe(() => undefined);

        api.cleanup();

        expect(listeners.size).toBe(0);
    });

    test('refresh loads the people database', async () => {
        const api = new PluginApiImpl({} as never, 'test/people');
        await api.people.refresh();
        expect(refresh).toHaveBeenCalled();
    });
});
