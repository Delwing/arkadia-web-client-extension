import Client from '../src/Client';
import initInvite from '../src/scripts/invite';
import { gmcp } from '../src/gmcp';
import { refresh, subscribe } from '../src/peopleStore';

jest.mock('../src/peopleStore', () => ({
    subscribe: jest.fn(),
    refresh: jest.fn(),
}));

const subscribeMock = subscribe as jest.MockedFunction<typeof subscribe>;
const refreshMock = refresh as jest.MockedFunction<typeof refresh>;

const MOCK_PEOPLE = [
    { name: 'Mordimer', description: 'templariusz', guild: 'Templariusze' },
    { name: 'Vesper', description: 'mag', guild: 'Magowie' },
    { name: 'Pablo', description: 'rycerz', guild: 'Rycerze' },
    { name: 'Gandalf', description: 'czarodziej', guild: 'Czarodzieje' },
];

describe('Invite functionality', () => {
    let client: Client;
    let mockTriggers: any;
    let mockFunctionalBind: any;
    let mockPrintln: jest.Mock;
    let mockAddEventListener: jest.Mock;
    let mockTeamManager: any;
    let mockSendCommand: jest.Mock;
    const subscribers: Array<(snapshot: typeof MOCK_PEOPLE | undefined) => void> = [];

    beforeEach(async () => {
        subscribers.length = 0;
        subscribeMock.mockReset().mockImplementation((listener) => {
            subscribers.push(listener as (snapshot: typeof MOCK_PEOPLE | undefined) => void);
            return () => {
                const index = subscribers.indexOf(listener as (snapshot: typeof MOCK_PEOPLE | undefined) => void);
                if (index >= 0) {
                    subscribers.splice(index, 1);
                }
            };
        });
        refreshMock.mockReset().mockImplementation(async () => {
            subscribers.forEach(listener => listener(MOCK_PEOPLE));
            return MOCK_PEOPLE;
        });
        mockTriggers = {
            registerTrigger: jest.fn()
        };

        mockFunctionalBind = {
            set: jest.fn()
        };

        mockPrintln = jest.fn();
        mockAddEventListener = jest.fn();
        mockSendCommand = jest.fn();

        mockTeamManager = {
            getAccumulatedObjectsData: jest.fn().mockReturnValue({
                "1": { desc: "Vesper", living: true, team: true },
                "2": { desc: "Pablo", living: true, team: true },
                "3": { desc: "Gandalf", living: true, team: true },
                "15": { desc: "Vesper", living: true, team: true }
            })
        };

        gmcp.objects = { nums: ['1', '2', '3', '15'] };

        client = {
            Triggers: mockTriggers,
            FunctionalBind: mockFunctionalBind,
            println: mockPrintln,
            sendCommand: mockSendCommand,
            addEventListener: mockAddEventListener,
            TeamManager: mockTeamManager
        } as any;

        initInvite(client);
        await refreshMock.mock.results[0]?.value;
    });

    afterEach(() => {
        jest.clearAllMocks();
        subscribers.length = 0;
        gmcp.objects = {};
    });

    test('should register invite trigger', async () => {
        const lastCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
        await lastCall?.value;
        expect(mockTriggers.registerTrigger).toHaveBeenCalledWith(
            expect.any(RegExp),
            expect.any(Function),
            'invite'
        );
    });

    test('should block invite from enemy guild member', async () => {
        // Set up enemy guilds
        const settingsHandler = mockAddEventListener.mock.calls.find(
            call => call[0] === 'settings'
        )[1];
        settingsHandler({ detail: { enemyGuilds: ['Templariusze'] } });
        const lastCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
        await lastCall?.value;

        // Get the trigger handler
        const triggerHandler = mockTriggers.registerTrigger.mock.calls[0][1];

        // Test invite from enemy guild member
        const result = triggerHandler(
            '[Mordimer] zaprasza cie do swojej druzyny.',
            '[Mordimer] zaprasza cie do swojej druzyny.',
            ['[Mordimer] zaprasza cie do swojej druzyny.', 'Mordimer']
        );

        expect(result).toBe('');
    });

    test('should allow invite from non-enemy guild member and execute two commands', async () => {
        // Set up enemy guilds
        const settingsHandler = mockAddEventListener.mock.calls.find(
            call => call[0] === 'settings'
        )[1];
        settingsHandler({ detail: { enemyGuilds: ['Templariusze'] } });
        const lastCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
        await lastCall?.value;

        // Get the trigger handler
        const triggerHandler = mockTriggers.registerTrigger.mock.calls[0][1];

        // Test invite from non-enemy guild member
        const result = triggerHandler(
            '[Vesper] zaprasza cie do swojej druzyny.',
            '[Vesper] zaprasza cie do swojej druzyny.',
            ['[Vesper] zaprasza cie do swojej druzyny.', 'Vesper']
        );

        expect(mockFunctionalBind.set).toHaveBeenCalledWith(
            'Przyjmij zaproszenie od Vesper',
            expect.any(Function)
        );
        expect(result).toBe('[Vesper] zaprasza cie do swojej druzyny.');

        // Test that the functional bind executes both commands
        const functionalBindCallback = mockFunctionalBind.set.mock.calls[0][1];
        functionalBindCallback();

        expect(mockSendCommand).toHaveBeenCalledWith('porzuc druzyne');
        expect(mockSendCommand).toHaveBeenCalledWith('dolacz do ob_15');
        expect(mockSendCommand).toHaveBeenCalledTimes(2);
    });

    test('should use newest object id for inviter name', async () => {
        const settingsHandler = mockAddEventListener.mock.calls.find(
            call => call[0] === 'settings'
        )[1];
        settingsHandler({ detail: { enemyGuilds: ['Templariusze'] } });
        const lastCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
        await lastCall?.value;

        const triggerHandler = mockTriggers.registerTrigger.mock.calls[0][1];

        triggerHandler(
            '[Vesper] zaprasza cie do swojej druzyny.',
            '[Vesper] zaprasza cie do swojej druzyny.',
            ['[Vesper] zaprasza cie do swojej druzyny.', 'Vesper']
        );

        const functionalBindCallback = mockFunctionalBind.set.mock.calls[0][1];
        functionalBindCallback();

        expect(mockSendCommand).toHaveBeenCalledWith('dolacz do ob_15');
    });

    test('should allow invite from unknown person and fallback to old command', async () => {
        // Set up enemy guilds
        const settingsHandler = mockAddEventListener.mock.calls.find(
            call => call[0] === 'settings'
        )[1];
        settingsHandler({ detail: { enemyGuilds: ['Templariusze'] } });
        const lastCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
        await lastCall?.value;

        // Get the trigger handler
        const triggerHandler = mockTriggers.registerTrigger.mock.calls[0][1];

        // Test invite from unknown person
        const result = triggerHandler(
            '[UnknownPlayer] zaprasza cie do swojej druzyny.',
            '[UnknownPlayer] zaprasza cie do swojej druzyny.',
            ['[UnknownPlayer] zaprasza cie do swojej druzyny.', 'UnknownPlayer']
        );

        expect(mockFunctionalBind.set).not.toHaveBeenCalled();
        expect(result).toBe('[UnknownPlayer] zaprasza cie do swojej druzyny.');
        expect(mockSendCommand).not.toHaveBeenCalled();
    });

    test('should allow all invites when no enemy guilds are set and fallback to old command', async () => {
        // Set up empty enemy guilds
        const settingsHandler = mockAddEventListener.mock.calls.find(
            call => call[0] === 'settings'
        )[1];
        settingsHandler({ detail: { enemyGuilds: [] } });
        const lastCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
        await lastCall?.value;

        const triggerHandler = mockTriggers.registerTrigger.mock.calls[0][1];

        const result = triggerHandler(
            '[Friendly] zaprasza cie do swojej druzyny.',
            '[Friendly] zaprasza cie do swojej druzyny.',
            ['[Friendly] zaprasza cie do swojej druzyny.', 'Friendly']
        );

        expect(result).toBe('[Friendly] zaprasza cie do swojej druzyny.');
        expect(mockSendCommand).not.toHaveBeenCalled();
    });
});
