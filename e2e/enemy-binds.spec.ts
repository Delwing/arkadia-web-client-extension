import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    getLastOutgoingCommand,
    GMCP_PATHS,
    pushGmcp,
    resetCommandLog,
    waitForCharacter,
    waitForCommandInput,
} from './support/mocks';
import type {Page} from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAYER_NUM = 91000;
const ENEMY1_NUM = 91001;
const ENEMY2_NUM = 91002;
const ENEMY3_NUM = 91003;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function pressKey(
    page: Page,
    code: string,
    modifiers: {ctrl?: boolean; alt?: boolean; shift?: boolean} = {},
): Promise<void> {
    if (modifiers.ctrl) await page.keyboard.down('Control');
    if (modifiers.alt) await page.keyboard.down('Alt');
    if (modifiers.shift) await page.keyboard.down('Shift');

    await page.keyboard.down(code);
    await page.keyboard.up(code);

    if (modifiers.shift) await page.keyboard.up('Shift');
    if (modifiers.alt) await page.keyboard.up('Alt');
    if (modifiers.ctrl) await page.keyboard.up('Control');
}

/**
 * Set enemyGuilds in character settings via localStorage and fire a storage
 * event so the live app picks up the change without a reload.
 */
async function setEnemyGuilds(page: Page, charName: string, guilds: string[]): Promise<void> {
    await page.evaluate(
        ([name, g]) => {
            const key = `${name}:settings`;
            const existing = JSON.parse(localStorage.getItem(key) ?? '{}');
            existing.enemyGuilds = g;
            localStorage.setItem(key, JSON.stringify(existing));
            window.dispatchEvent(
                new StorageEvent('storage', {
                    key,
                    newValue: JSON.stringify(existing),
                    storageArea: localStorage,
                }),
            );
        },
        [charName, guilds] as [string, string[]],
    );
    await page.waitForTimeout(100);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Enemy bind keys (F1/F2/F3 and Ctrl+F1/F2/F3)', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        // Log in as a character so character-scoped settings apply
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Warrior', object_num: PLAYER_NUM});
        await waitForCharacter(page, 'Warrior');
    });

    // -----------------------------------------------------------------------
    // Attack binds (F1 / F2 / F3)
    // -----------------------------------------------------------------------

    test.describe('F1 attack bind', () => {
        test('sends "zabij ob_<id>" when enemy is in slot 1', async ({page}) => {
            // Make guild CKN an enemy guild for the logged-in character
            await setEnemyGuilds(page, 'Warrior', ['CKN']);

            // Push GMCP objects: player + one CKN enemy (Aldous = "Wysoki wojownik", guild CKN)
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                [String(PLAYER_NUM)]: {desc: 'Warrior', team: false, attack_num: false},
                [String(ENEMY1_NUM)]: {desc: 'Wysoki wojownik', attack_num: false},
            });
            await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [PLAYER_NUM, ENEMY1_NUM]);

            await resetCommandLog(page);
            await pressKey(page, 'F1');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: `F1 should send "zabij ob_${ENEMY1_NUM}"`,
                    timeout: 3000,
                })
                .toBe(`zabij ob_${ENEMY1_NUM}`);
        });

        test('sends nothing when no enemies are bound to any slot', async ({page}) => {
            // No enemy guilds set — none of the objects will be recognised as enemies
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                [String(PLAYER_NUM)]: {desc: 'Warrior', team: false, attack_num: false},
            });
            await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [PLAYER_NUM]);

            await resetCommandLog(page);
            await pressKey(page, 'F1');
            await page.waitForTimeout(200);

            const commands = await getCommandLog(page);
            expect(commands).toHaveLength(0);
        });
    });

    test.describe('F2 attack bind', () => {
        test('sends "zabij ob_<id>" for the second enemy', async ({page}) => {
            await setEnemyGuilds(page, 'Warrior', ['CKN', 'SGW']);

            // Push two enemies: slot 0 → ENEMY1, slot 1 → ENEMY2
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                [String(PLAYER_NUM)]:  {desc: 'Warrior',          team: false, attack_num: false},
                [String(ENEMY1_NUM)]: {desc: 'Wysoki wojownik',  attack_num: false}, // CKN
                [String(ENEMY2_NUM)]: {desc: 'Cicha zabojczyni', attack_num: false}, // SGW
            });
            await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [PLAYER_NUM, ENEMY1_NUM, ENEMY2_NUM]);

            await resetCommandLog(page);
            await pressKey(page, 'F2');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: `F2 should send "zabij ob_${ENEMY2_NUM}"`,
                    timeout: 3000,
                })
                .toBe(`zabij ob_${ENEMY2_NUM}`);
        });
    });

    test.describe('F3 attack bind', () => {
        test('sends "zabij ob_<id>" for the third enemy', async ({page}) => {
            await setEnemyGuilds(page, 'Warrior', ['CKN', 'SGW', 'KG']);

            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                [String(PLAYER_NUM)]:  {desc: 'Warrior',           team: false, attack_num: false},
                [String(ENEMY1_NUM)]: {desc: 'Wysoki wojownik',   attack_num: false}, // CKN
                [String(ENEMY2_NUM)]: {desc: 'Cicha zabojczyni',  attack_num: false}, // SGW
                [String(ENEMY3_NUM)]: {desc: 'Kupiec wedrowny',   attack_num: false}, // KG
            });
            await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [PLAYER_NUM, ENEMY1_NUM, ENEMY2_NUM, ENEMY3_NUM]);

            await resetCommandLog(page);
            await pressKey(page, 'F3');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: `F3 should send "zabij ob_${ENEMY3_NUM}"`,
                    timeout: 3000,
                })
                .toBe(`zabij ob_${ENEMY3_NUM}`);
        });
    });

    // -----------------------------------------------------------------------
    // Block binds (Ctrl+F1 / Ctrl+F2 / Ctrl+F3)
    // -----------------------------------------------------------------------

    test.describe('Ctrl+F1 block bind', () => {
        test('sends "zablokuj ob_<id>"', async ({page}) => {
            await setEnemyGuilds(page, 'Warrior', ['CKN']);

            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                [String(PLAYER_NUM)]:  {desc: 'Warrior',         team: false, attack_num: false},
                [String(ENEMY1_NUM)]: {desc: 'Wysoki wojownik', attack_num: false},
            });
            await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [PLAYER_NUM, ENEMY1_NUM]);

            await resetCommandLog(page);
            await pressKey(page, 'F1', {ctrl: true});

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: `Ctrl+F1 should send "zablokuj ob_${ENEMY1_NUM}"`,
                    timeout: 3000,
                })
                .toBe(`zablokuj ob_${ENEMY1_NUM}`);
        });
    });

    test.describe('Ctrl+F2 block bind', () => {
        test('sends "zablokuj ob_<id>" for the second enemy', async ({page}) => {
            await setEnemyGuilds(page, 'Warrior', ['CKN', 'SGW']);

            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                [String(PLAYER_NUM)]:  {desc: 'Warrior',          team: false, attack_num: false},
                [String(ENEMY1_NUM)]: {desc: 'Wysoki wojownik',  attack_num: false},
                [String(ENEMY2_NUM)]: {desc: 'Cicha zabojczyni', attack_num: false},
            });
            await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [PLAYER_NUM, ENEMY1_NUM, ENEMY2_NUM]);

            await resetCommandLog(page);
            await pressKey(page, 'F2', {ctrl: true});

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: `Ctrl+F2 should send "zablokuj ob_${ENEMY2_NUM}"`,
                    timeout: 3000,
                })
                .toBe(`zablokuj ob_${ENEMY2_NUM}`);
        });
    });

    test.describe('Ctrl+F3 block bind', () => {
        test('sends "zablokuj ob_<id>" for the third enemy', async ({page}) => {
            await setEnemyGuilds(page, 'Warrior', ['CKN', 'SGW', 'KG']);

            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                [String(PLAYER_NUM)]:  {desc: 'Warrior',           team: false, attack_num: false},
                [String(ENEMY1_NUM)]: {desc: 'Wysoki wojownik',   attack_num: false},
                [String(ENEMY2_NUM)]: {desc: 'Cicha zabojczyni',  attack_num: false},
                [String(ENEMY3_NUM)]: {desc: 'Kupiec wedrowny',   attack_num: false},
            });
            await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [PLAYER_NUM, ENEMY1_NUM, ENEMY2_NUM, ENEMY3_NUM]);

            await resetCommandLog(page);
            await pressKey(page, 'F3', {ctrl: true});

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: `Ctrl+F3 should send "zablokuj ob_${ENEMY3_NUM}"`,
                    timeout: 3000,
                })
                .toBe(`zablokuj ob_${ENEMY3_NUM}`);
        });
    });

    // -----------------------------------------------------------------------
    // Dynamic update: binds change when new GMCP objects arrive
    // -----------------------------------------------------------------------

    test.describe('Enemy bind update on new GMCP objects', () => {
        test('F1 sends the updated enemy id after a second GMCP objects.data event', async ({page}) => {
            await setEnemyGuilds(page, 'Warrior', ['CKN']);

            // First wave: enemy at ENEMY1_NUM
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                [String(PLAYER_NUM)]:  {desc: 'Warrior',         team: false, attack_num: false},
                [String(ENEMY1_NUM)]: {desc: 'Wysoki wojownik', attack_num: false},
            });
            await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [PLAYER_NUM, ENEMY1_NUM]);

            // Verify the first binding
            await resetCommandLog(page);
            await pressKey(page, 'F1');
            await expect
                .poll(async () => await getLastOutgoingCommand(page), {timeout: 3000})
                .toBe(`zabij ob_${ENEMY1_NUM}`);

            // Second wave: different enemy id (ENEMY2_NUM) — same guild, different object
            const NEW_ENEMY_NUM = 91050;
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                [String(PLAYER_NUM)]:    {desc: 'Warrior',         team: false, attack_num: false},
                [String(NEW_ENEMY_NUM)]: {desc: 'Wysoki wojownik', attack_num: false},
            });
            await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [PLAYER_NUM, NEW_ENEMY_NUM]);

            await resetCommandLog(page);
            await pressKey(page, 'F1');
            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: `F1 should now send "zabij ob_${NEW_ENEMY_NUM}" after re-bind`,
                    timeout: 3000,
                })
                .toBe(`zabij ob_${NEW_ENEMY_NUM}`);
        });
    });
});
