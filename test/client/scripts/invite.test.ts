import Client from '@client/Client';
import { createRootScope } from '@client/ScriptScope';
import initInvite from '@client/scripts/invite';
import { gmcp } from '@client/gmcp';
import { characterStorage } from '@modules/core/storage';
import { setTestSettings } from '../helpers/testSettings';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

vi.mock('@modules/data/peopleLoader', () => ({
    subscribeMerged: jest.fn(),
    refresh: jest.fn(),
}));

import { subscribeMerged, refresh } from '@modules/data/peopleLoader';

const subscribeMergedMock = subscribeMerged as jest.MockedFunction<typeof subscribeMerged>;
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
    let mockTeamManager: any;
    let mockSendCommand: jest.Mock;
    const subscribers: Array<(snapshot: typeof MOCK_PEOPLE | undefined) => void> = [];

    beforeEach(async () => {
        subscribers.length = 0;
        subscribeMergedMock.mockReset().mockImplementation((listener) => {
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
        mockSendCommand = jest.fn();

        mockTeamManager = {
            getAccumulatedObjectsData: jest.fn().mockReturnValue(new Map([
                [1, { desc: "Vesper", living: true, team: true }],
                [2, { desc: "Pablo", living: true, team: true }],
                [3, { desc: "Gandalf", living: true, team: true }],
                [15, { desc: "Vesper", living: true, team: true }]
            ]))
        };

        gmcp.objects = { nums: [1, 2, 3, 15] };

        characterStorage.setCharacter('TestChar');

        client = {
            scope: createRootScope('test'),
            Triggers: mockTriggers,
            FunctionalBind: mockFunctionalBind,
            println: mockPrintln,
            sendCommand: mockSendCommand,
            TeamManager: mockTeamManager
        } as any;

        initInvite(client);
        await refreshMock.mock.results[0]?.value;
    });

    afterEach(() => {
        jest.clearAllMocks();
        subscribers.length = 0;
        gmcp.objects = {};
        localStorage.clear();
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
        // Set up enemy guilds via characterStorage
        setTestSettings({ enemyGuilds: ['Templariusze'] });
        const lastCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
        await lastCall?.value;

        // Get the trigger handler
        const triggerHandler = mockTriggers.registerTrigger.mock.calls[0][1];

        // Test invite from enemy guild member - line should pass through but no functional bind created
        const line = new AnsiAwareBuffer('[Mordimer] zaprasza cie do swojej druzyny.');
        const matches = ['[Mordimer] zaprasza cie do swojej druzyny.', 'Mordimer'] as RegExpMatchArray;
        const result = triggerHandler(line, matches, '');

        // Line should be displayed (not blocked)
        expect(result).toBe(line);
        // But no functional bind should be created for enemy guild member
        expect(mockFunctionalBind.set).not.toHaveBeenCalled();
    });

    test('should allow invite from non-enemy guild member and execute two commands', async () => {
        // Set up enemy guilds via characterStorage
        setTestSettings({ enemyGuilds: ['Templariusze'] });
        const lastCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
        await lastCall?.value;

        // Get the trigger handler
        const triggerHandler = mockTriggers.registerTrigger.mock.calls[0][1];

        // Test invite from non-enemy guild member
        const line = new AnsiAwareBuffer('[Vesper] zaprasza cie do swojej druzyny.');
        const matches = ['[Vesper] zaprasza cie do swojej druzyny.', 'Vesper'] as RegExpMatchArray;
        const result = triggerHandler(line, matches, '');

        expect(mockFunctionalBind.set).toHaveBeenCalledWith(
            'Przyjmij zaproszenie od Vesper',
            expect.any(Function)
        );
        expect(result).toBe(line);

        // Test that the functional bind executes both commands
        const functionalBindCallback = mockFunctionalBind.set.mock.calls[0][1];
        functionalBindCallback();

        expect(mockSendCommand).toHaveBeenCalledWith('porzuc druzyne');
        expect(mockSendCommand).toHaveBeenCalledWith('dolacz do ob_15');
        expect(mockSendCommand).toHaveBeenCalledTimes(2);
    });

    test('should use newest object id for inviter name', async () => {
        setTestSettings({ enemyGuilds: ['Templariusze'] });
        const lastCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
        await lastCall?.value;

        const triggerHandler = mockTriggers.registerTrigger.mock.calls[0][1];

        const line = new AnsiAwareBuffer('[Vesper] zaprasza cie do swojej druzyny.');
        const matches = ['[Vesper] zaprasza cie do swojej druzyny.', 'Vesper'] as RegExpMatchArray;
        triggerHandler(line, matches, '');

        const functionalBindCallback = mockFunctionalBind.set.mock.calls[0][1];
        functionalBindCallback();

        expect(mockSendCommand).toHaveBeenCalledWith('dolacz do ob_15');
    });

    test('should allow invite from unknown person and fallback to old command', async () => {
        // Set up enemy guilds via characterStorage
        setTestSettings({ enemyGuilds: ['Templariusze'] });
        const lastCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
        await lastCall?.value;

        // Get the trigger handler
        const triggerHandler = mockTriggers.registerTrigger.mock.calls[0][1];

        // Test invite from unknown person
        const line = new AnsiAwareBuffer('[UnknownPlayer] zaprasza cie do swojej druzyny.');
        const matches = ['[UnknownPlayer] zaprasza cie do swojej druzyny.', 'UnknownPlayer'] as RegExpMatchArray;
        const result = triggerHandler(line, matches, '');

        expect(mockFunctionalBind.set).not.toHaveBeenCalled();
        expect(result).toBe(line);
        expect(mockSendCommand).not.toHaveBeenCalled();
    });

    test('should allow all invites when no enemy guilds are set and fallback to old command', async () => {
        // Set up empty enemy guilds
        setTestSettings({ enemyGuilds: [] });
        const lastCall = refreshMock.mock.results[refreshMock.mock.results.length - 1];
        await lastCall?.value;

        const triggerHandler = mockTriggers.registerTrigger.mock.calls[0][1];

        const line = new AnsiAwareBuffer('[Friendly] zaprasza cie do swojej druzyny.');
        const matches = ['[Friendly] zaprasza cie do swojej druzyny.', 'Friendly'] as RegExpMatchArray;
        const result = triggerHandler(line, matches, '');

        expect(result).toBe(line);
        expect(mockSendCommand).not.toHaveBeenCalled();
    });
});
