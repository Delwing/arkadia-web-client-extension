import initLastSeen from '@client/scripts/lastSeen';
import { refresh, subscribe, forceRefresh } from '@modules/data/peopleStore';
import { characterStorage } from '@modules/core/storage';
import { setTestSettings } from '../helpers/testSettings';
import { clearLocalEvents } from '@modules/data/peopleLoader';
import { EventEmitter } from 'events';
import { FakeClientBase } from '../helpers/fakeClient';

vi.mock('@modules/data/peopleStore', () => ({
    subscribe: jest.fn(),
    refresh: jest.fn(),
    forceRefresh: jest.fn(),
}));

const subscribeMock = subscribe as jest.MockedFunction<typeof subscribe>;
const refreshMock = refresh as jest.MockedFunction<typeof refresh>;
const forceRefreshMock = forceRefresh as jest.MockedFunction<typeof forceRefresh>;

const MOCK_PEOPLE = [
    { name: 'Grobl', description: 'wielki ogr', guild: 'WROGOWIE' },
    { name: 'Sojusz', description: 'maly elf', guild: 'PRZYJACIELE' },
];

class FakeClient extends FakeClientBase {
    private emitter = new EventEmitter();
    println = jest.fn();
    Triggers = { registerTrigger: jest.fn() };
    TeamManager = { getTeamMembers: () => [] as string[] };
    on(event: string, cb: any) {
        this.emitter.on(event, cb);
    }
    emit(event: string, payload?: any) {
        this.emitter.emit(event, payload);
    }
}

function lastPrintedText(client: FakeClient): string {
    const arg = client.println.mock.calls.at(-1)?.[0];
    if (arg == null) return '';
    return typeof arg === 'string' ? arg : arg.text;
}

describe('/hp wroga (lastSeen)', () => {
    let client: FakeClient;
    let aliases: { pattern: RegExp; callback: Function }[];
    const subscribers: Array<(snapshot: typeof MOCK_PEOPLE | undefined) => void> = [];

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        clearLocalEvents();
        subscribers.length = 0;
        subscribeMock.mockReset().mockImplementation((listener) => {
            subscribers.push(listener as any);
            return () => undefined;
        });
        refreshMock.mockReset().mockImplementation(async () => {
            subscribers.forEach((listener) => listener(MOCK_PEOPLE));
            return MOCK_PEOPLE;
        });
        forceRefreshMock.mockReset().mockImplementation(async () => {
            subscribers.forEach((listener) => listener(MOCK_PEOPLE));
            return MOCK_PEOPLE;
        });

        client = new FakeClient();
        aliases = [];
    });

    function runHp(arg: string) {
        const alias = aliases.find(a => a.pattern.test(`/hp ${arg}`));
        const matches = `/hp ${arg}`.match(alias!.pattern)!;
        alias!.callback(matches);
    }

    it('includes enemies that belong to an enemy guild', async () => {
        setTestSettings({ enemyGuilds: ['WROGOWIE'] });
        initLastSeen(client as any, aliases);
        // Wait for the people store refresh to populate merged data.
        await Promise.resolve();
        await Promise.resolve();

        client.emit('gmcp.objects.data', { '1': { desc: 'wielki ogr', hp: 4 } });

        runHp('wroga');

        const text = lastPrintedText(client);
        expect(text).toContain('wielki ogr');
    });

    it('excludes non-enemy guild members', async () => {
        setTestSettings({ enemyGuilds: ['WROGOWIE'] });
        initLastSeen(client as any, aliases);
        await Promise.resolve();
        await Promise.resolve();

        client.emit('gmcp.objects.data', { '1': { desc: 'maly elf', hp: 4 } });

        runHp('wroga');

        const text = lastPrintedText(client);
        expect(text).toContain('Nie znaleziono');
    });
});
