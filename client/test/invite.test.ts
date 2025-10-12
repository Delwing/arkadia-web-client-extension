import type Client from '../src/Client';
import initInvite from '../src/scripts/invite';
import type { PersonEntry } from '../src/types/people';
import { PeopleDataCatalog, registerPeopleLoader } from '../src/runtime/data';

const MOCK_PEOPLE: PersonEntry[] = [
    { name: 'Mordimer', description: 'templariusz', guild: 'Templariusze' },
    { name: 'Vesper', description: 'mag', guild: 'Magowie' },
    { name: 'Pablo', description: 'rycerz', guild: 'Rycerze' },
    { name: 'Gandalf', description: 'czarodziej', guild: 'Czarodzieje' },
];

async function createCatalogWithPeople(people: PersonEntry[]): Promise<PeopleDataCatalog> {
    const catalog = new PeopleDataCatalog();
    registerPeopleLoader({
        catalog,
        loader: async () => people,
    });
    await catalog.setPeopleData(people, 'loader');
    return catalog;
}

describe('Invite functionality', () => {
    let client: Client;
    let mockTriggers: any;
    let mockFunctionalBind: any;
    let mockPrintln: jest.Mock;
    let mockAddEventListener: jest.Mock;
    let mockTeamManager: any;
    let mockSendCommand: jest.Mock;

    beforeEach(async () => {
        mockTriggers = {
            registerTrigger: jest.fn(),
        };

        mockFunctionalBind = {
            set: jest.fn(),
        };

        mockPrintln = jest.fn();
        mockAddEventListener = jest.fn();
        mockSendCommand = jest.fn();

        mockTeamManager = {
            getAccumulatedObjectsData: jest.fn().mockReturnValue({
                '1': { desc: 'Vesper', living: true, team: true },
                '2': { desc: 'Pablo', living: true, team: true },
                '3': { desc: 'Gandalf', living: true, team: true },
            }),
        };

        client = {
            Triggers: mockTriggers,
            FunctionalBind: mockFunctionalBind,
            println: mockPrintln,
            sendCommand: mockSendCommand,
            addEventListener: mockAddEventListener,
            TeamManager: mockTeamManager,
        } as any;

        const catalog = await createCatalogWithPeople(MOCK_PEOPLE);
        initInvite(client, catalog);
    });

    test('should register invite trigger', () => {
        expect(mockTriggers.registerTrigger).toHaveBeenCalledWith(
            expect.any(RegExp),
            expect.any(Function),
            'invite',
        );
    });

    test('should block invite from enemy guild member', () => {
        const settingsHandler = mockAddEventListener.mock.calls.find(
            (call: any[]) => call[0] === 'settings',
        )[1];
        settingsHandler({ detail: { enemyGuilds: ['Templariusze'] } });

        const triggerHandler = mockTriggers.registerTrigger.mock.calls[0][1];
        const result = triggerHandler(
            '[Mordimer] zaprasza cie do swojej druzyny.',
            '[Mordimer] zaprasza cie do swojej druzyny.',
            ['[Mordimer] zaprasza cie do swojej druzyny.', 'Mordimer'],
        );

        expect(result).toBe('');
    });

    test('should allow invite from non-enemy guild member and execute two commands', () => {
        const settingsHandler = mockAddEventListener.mock.calls.find(
            (call: any[]) => call[0] === 'settings',
        )[1];
        settingsHandler({ detail: { enemyGuilds: ['Templariusze'] } });

        const triggerHandler = mockTriggers.registerTrigger.mock.calls[0][1];
        const result = triggerHandler(
            '[Vesper] zaprasza cie do swojej druzyny.',
            '[Vesper] zaprasza cie do swojej druzyny.',
            ['[Vesper] zaprasza cie do swojej druzyny.', 'Vesper'],
        );

        expect(mockFunctionalBind.set).toHaveBeenCalledWith(
            'Przyjmij zaproszenie od Vesper',
            expect.any(Function),
        );
        expect(result).toBe('[Vesper] zaprasza cie do swojej druzyny.');

        const functionalBindCallback = mockFunctionalBind.set.mock.calls[0][1];
        functionalBindCallback();

        expect(mockSendCommand).toHaveBeenCalledWith('porzuc druzyne');
        expect(mockSendCommand).toHaveBeenCalledWith('dolacz do ob_1');
        expect(mockSendCommand).toHaveBeenCalledTimes(2);
    });

    test('should allow invite from unknown person and fallback to old command', () => {
        const settingsHandler = mockAddEventListener.mock.calls.find(
            (call: any[]) => call[0] === 'settings',
        )[1];
        settingsHandler({ detail: { enemyGuilds: ['Templariusze'] } });

        const triggerHandler = mockTriggers.registerTrigger.mock.calls[0][1];
        const result = triggerHandler(
            '[UnknownPlayer] zaprasza cie do swojej druzyny.',
            '[UnknownPlayer] zaprasza cie do swojej druzyny.',
            ['[UnknownPlayer] zaprasza cie do swojej druzyny.', 'UnknownPlayer'],
        );

        expect(mockFunctionalBind.set).not.toHaveBeenCalled();
        expect(result).toBe('[UnknownPlayer] zaprasza cie do swojej druzyny.');
        expect(mockSendCommand).not.toHaveBeenCalled();
    });

    test('should allow all invites when no enemy guilds are set and fallback to old command', () => {
        const settingsHandler = mockAddEventListener.mock.calls.find(
            (call: any[]) => call[0] === 'settings',
        )[1];
        settingsHandler({ detail: { enemyGuilds: [] } });

        const triggerHandler = mockTriggers.registerTrigger.mock.calls[0][1];
        const result = triggerHandler(
            '[Mordimer] zaprasza cie do swojej druzyny.',
            '[Mordimer] zaprasza cie do swojej druzyny.',
            ['[Mordimer] zaprasza cie do swojej druzyny.', 'Mordimer'],
        );

        expect(mockFunctionalBind.set).not.toHaveBeenCalled();
        expect(result).toBe('[Mordimer] zaprasza cie do swojej druzyny.');
        expect(mockSendCommand).not.toHaveBeenCalled();
    });

    test('should handle invite pattern without brackets', () => {
        const settingsHandler = mockAddEventListener.mock.calls.find(
            (call: any[]) => call[0] === 'settings',
        )[1];
        settingsHandler({ detail: { enemyGuilds: ['Czarodzieje'] } });

        const triggerHandler = mockTriggers.registerTrigger.mock.calls[0][1];
        const result = triggerHandler(
            'Gandalf zaprasza cie do swojej druzyny.',
            'Gandalf zaprasza cie do swojej druzyny.',
            ['Gandalf zaprasza cie do swojej druzyny.', 'Gandalf'],
        );

        expect(result).toBe('');
    });
});
