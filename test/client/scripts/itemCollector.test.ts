import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import { initItemCollector } from '@client/scripts/itemCollector';

function createClient(): Client {
    return new Client({
        send: () => {},
        output: () => {},
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

// CollectionMode: 1 All, 2 Leader, 3 Team, 4 None
// CollectionTiming: 1 AtEnd, 2 AfterEachKill, 3 Both
const ALL = 1, LEADER = 2, TEAM = 3, NONE = 4;
const AT_END = 1, AFTER_EACH = 2;

describe('itemCollector', () => {
    let client: Client;
    let commands: string[];
    let offCommand: () => void;
    let setCategory: ReturnType<typeof vi.spyOn>;
    let clearCategory: ReturnType<typeof vi.spyOn>;

    function setup(settings: Record<string, unknown> = {}) {
        characterStorage.set('settings', {
            collectMode: ALL,
            collectTiming: AFTER_EACH,
            collectCopper: true,
            collectSilver: true,
            collectGold: true,
            collectGems: false,
            collectExtra: [],
            collectOverrides: [],
            ...settings,
        } as any);
        client = createClient();
        commands = [];
        const sink = commands;
        offCommand = client.on('command', (c: string) => { sink.push(c); });
        setCategory = vi.spyOn(client.FunctionalBind, 'setCategory').mockImplementation(() => {});
        clearCategory = vi.spyOn(client.FunctionalBind, 'clearCategory').mockImplementation(() => {});
        return initItemCollector(client, client.aliases);
    }

    /** Fire the bind the collector offered. */
    async function fireBind() {
        const cb = setCategory.mock.calls.at(-1)![2] as () => void;
        cb();
        await new Promise(r => setTimeout(r, 0));
    }

    function kill(extra: Record<string, unknown> = {}) {
        client.sendEvent('enemyKilled', { killer: 'ME', hasBody: true, ...extra } as any);
    }

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        offCommand = () => {};
    });

    afterEach(() => {
        offCommand();
        vi.restoreAllMocks();
    });

    describe('offering the loot bind', () => {
        test('a kill with a body offers "wez z ciala"', () => {
            setup();

            kill();

            expect(setCategory).toHaveBeenCalledWith('loot', 'wez z ciala', expect.any(Function));
        });

        test('a kill without a body offers nothing', () => {
            setup();

            kill({ hasBody: false });

            expect(setCategory).not.toHaveBeenCalled();
        });

        test('mode None never offers anything', () => {
            setup({ collectMode: NONE });

            kill();

            expect(setCategory).not.toHaveBeenCalled();
        });

        test('nothing is offered when every category is disabled', () => {
            setup({ collectCopper: false, collectSilver: false, collectGold: false, collectGems: false });

            kill();

            expect(setCategory).not.toHaveBeenCalled();
        });

        test('AtEnd timing waits for all enemies to die', () => {
            setup({ collectTiming: AT_END });

            kill();
            expect(setCategory).not.toHaveBeenCalled();

            client.sendEvent('allEnemiesKilled');
            expect(setCategory).toHaveBeenCalled();
        });

        test('leaving the room drops the pending loot', () => {
            setup();
            kill();

            client.sendEvent('enterLocation', {} as any);

            expect(clearCategory).toHaveBeenCalledWith('loot');
        });
    });

    describe('who killed it', () => {
        test('Leader mode collects when solo', () => {
            setup({ collectMode: LEADER });
            client.TeamManager.isInAnyTeam = () => false;

            kill({ killer: 'OTHER' });

            expect(setCategory).toHaveBeenCalled();
        });

        test('Leader mode skips when in a team and not leading', () => {
            setup({ collectMode: LEADER });
            client.TeamManager.isInAnyTeam = () => true;
            client.TeamManager.isLeader = () => false;

            kill();

            expect(setCategory).not.toHaveBeenCalled();
        });

        test('Team mode collects your own and team kills', () => {
            setup({ collectMode: TEAM });
            client.TeamManager.isInAnyTeam = () => true;

            kill({ killer: 'TEAM' });

            expect(setCategory).toHaveBeenCalled();
        });

        test('Team mode skips a stranger kill', () => {
            setup({ collectMode: TEAM });
            client.TeamManager.isInAnyTeam = () => true;

            kill({ killer: 'OTHER' });

            expect(setCategory).not.toHaveBeenCalled();
        });
    });

    describe('what gets taken', () => {
        test('all three coin types collapse to "wez monety"', async () => {
            setup();
            kill();

            await fireBind();

            expect(commands).toContain('wez monety z ciala');
        });

        test('a partial coin selection takes them one by one', async () => {
            setup({ collectGold: false });
            kill();

            await fireBind();

            expect(commands).toContain('wez miedziane monety z ciala');
            expect(commands).toContain('wez srebrne monety z ciala');
            expect(commands).not.toContain('wez zlote monety z ciala');
        });

        test('gems are taken and evaluated', async () => {
            setup({ collectGems: true });
            kill();

            await fireBind();

            expect(commands).toContain('wez kamienie z ciala');
            expect(commands).toContain('ocen kamienie');
        });

        test('extras are taken by name', async () => {
            setup({ collectExtra: ['skore'] });
            kill();

            await fireBind();

            expect(commands).toContain('wez skore z ciala');
        });

        test('the bind is cleared once the body is looted', async () => {
            setup();
            kill();

            await fireBind();

            expect(clearCategory).toHaveBeenCalledWith('loot');
        });
    });

    describe('per-enemy overrides', () => {
        test('an override replaces the global preferences', async () => {
            setup({
                collectOverrides: [{
                    enemy: 'szczur',
                    collectCopper: false,
                    collectSilver: false,
                    collectGold: true,
                    collectGems: false,
                    collectExtra: ['ogon'],
                }],
            });

            kill({ enemyDesc: 'wielki szczur' });
            await fireBind();

            expect(commands).toContain('wez zlote monety z ciala');
            expect(commands).toContain('wez ogon z ciala');
            expect(commands).not.toContain('wez miedziane monety z ciala');
        });

        test('an override that disables everything skips the enemy', () => {
            setup({
                collectOverrides: [{
                    enemy: 'szczur',
                    collectCopper: false,
                    collectSilver: false,
                    collectGold: false,
                    collectGems: false,
                    collectExtra: [],
                }],
            });

            kill({ enemyDesc: 'wielki szczur' });

            expect(setCategory).not.toHaveBeenCalled();
        });

        test('a non-matching enemy keeps the global preferences', async () => {
            setup({
                collectOverrides: [{
                    enemy: 'szczur',
                    collectCopper: false, collectSilver: false, collectGold: false,
                    collectGems: false, collectExtra: [],
                }],
            });

            kill({ enemyDesc: 'goblin' });
            await fireBind();

            expect(commands).toContain('wez monety z ciala');
        });
    });

    describe('/zbieraj_extra', () => {
        test('adds an item to the extras list', async () => {
            const collector = setup();

            await client.sendCommand('/zbieraj_extra skore');

            expect(collector.extra).toContain('skore');
        });

        test('/nie_zbieraj_extra removes one', async () => {
            const collector = setup({ collectExtra: ['skore', 'ogon'] });

            await client.sendCommand('/nie_zbieraj_extra skore');

            expect(collector.extra).toEqual(['ogon']);
        });

        test('/nie_zbieraj_extra with no argument clears them all', async () => {
            const collector = setup({ collectExtra: ['skore', 'ogon'] });

            await client.sendCommand('/nie_zbieraj_extra');

            expect(collector.extra).toEqual([]);
        });
    });
});
