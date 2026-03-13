import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    getLastOutgoingCommand,
    GMCP_PATHS,
    primeCharInfo,
    pushGmcp,
    resetCommandLog,
    submitCommand,
    waitForCharacter,
    waitForCommandInput,
} from './support/mocks';
import type {Page} from '@playwright/test';

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Client keydown handler', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page);
    });

    // -----------------------------------------------------------------------
    // 1. Lamp bind (Ctrl+Digit4)
    // -----------------------------------------------------------------------

    test.describe('Lamp bind (Ctrl+4)', () => {
        test('sends "napelnij lampe olejem" to server', async ({page}) => {
            await resetCommandLog(page);

            await pressKey(page, 'Digit4', {ctrl: true});

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'Ctrl+4 should send "napelnij lampe olejem"',
                    timeout: 3000,
                })
                .toBe('napelnij lampe olejem');
        });

        test('does not send lamp command without Ctrl modifier', async ({page}) => {
            await resetCommandLog(page);

            // Press plain Digit4 (no Ctrl) — should NOT trigger lamp
            await page.locator('#message-input').focus();
            await pressKey(page, 'Digit4');
            await page.waitForTimeout(200); // negative assertion — no command sent

            const commands = await getCommandLog(page);
            expect(commands).toHaveLength(0);
        });
    });

    // -----------------------------------------------------------------------
    // 2. Attack bind (Ctrl+Digit1) with GMCP enemy
    // -----------------------------------------------------------------------

    test.describe('Attack bind (Ctrl+1)', () => {
        const PLAYER_NUM = 90100;
        const ENEMY_ID = 90101;

        test('sends "zabij ob_<id>" when attack target is present', async ({page}) => {
            // Set player identity
            await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'AttackHero', object_num: PLAYER_NUM});
            await waitForCharacter(page, 'AttackHero');

            // Register enemy with attack_target: true
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                [String(PLAYER_NUM)]: {desc: 'AttackHero', team: false, attack_num: false},
                [String(ENEMY_ID)]: {desc: 'Goblin', attack_num: false, attack_target: true},
            });
            await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [PLAYER_NUM, ENEMY_ID]);

            await resetCommandLog(page);
            await pressKey(page, 'Digit1', {ctrl: true});

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: `Ctrl+1 should send "zabij ob_${ENEMY_ID}"`,
                    timeout: 3000,
                })
                .toBe(`zabij ob_${ENEMY_ID}`);
        });

        test('sends nothing when no attack target is registered', async ({page}) => {
            // No GMCP objects with attack_target: true
            await resetCommandLog(page);
            await pressKey(page, 'Digit1', {ctrl: true});
            await page.waitForTimeout(200); // negative assertion — no command sent

            const commands = await getCommandLog(page);
            expect(commands).toHaveLength(0);
        });
    });

    // -----------------------------------------------------------------------
    // 3. Attack bind respects custom attackCommand from settings
    // -----------------------------------------------------------------------

    test.describe('Attack bind with custom attackCommand', () => {
        const PLAYER_NUM = 90200;
        const ENEMY_ID = 90201;

        test('uses custom attack command after settings change', async ({page}) => {
            // Establish character
            await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'CustomAttacker', object_num: PLAYER_NUM});
            await waitForCharacter(page, 'CustomAttacker');

            // Open Settings and change attack command from "zabij" to "napadnij"
            await page.click('#menu-button');
            await page.click('#options-button');
            const modal = page.locator('#options-modal');
            await expect(modal).toBeVisible();

            const attackInput = modal.locator('input[placeholder="zabij"]');
            await attackInput.clear();
            await attackInput.fill('napadnij');
            await page.click('#options-save');
            await expect(modal).not.toBeVisible();

            // Register enemy with attack_target: true
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                [String(PLAYER_NUM)]: {desc: 'CustomAttacker', team: false, attack_num: false},
                [String(ENEMY_ID)]: {desc: 'Goblin', attack_num: false, attack_target: true},
            });
            await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [PLAYER_NUM, ENEMY_ID]);

            await resetCommandLog(page);
            await pressKey(page, 'Digit1', {ctrl: true});

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: `Ctrl+1 should send "napadnij ob_${ENEMY_ID}" after changing attack command`,
                    timeout: 3000,
                })
                .toBe(`napadnij ob_${ENEMY_ID}`);
        });

        test('uses default "zabij" when settings are cleared', async ({page}) => {
            // Establish character
            await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'DefaultAttacker', object_num: PLAYER_NUM + 10});
            await waitForCharacter(page, 'DefaultAttacker');

            // Register enemy
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                [String(PLAYER_NUM + 10)]: {desc: 'DefaultAttacker', team: false, attack_num: false},
                [String(ENEMY_ID + 10)]: {desc: 'Orc', attack_num: false, attack_target: true},
            });
            await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [PLAYER_NUM + 10, ENEMY_ID + 10]);

            await resetCommandLog(page);
            await pressKey(page, 'Digit1', {ctrl: true});

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: `Ctrl+1 should send default "zabij ob_${ENEMY_ID + 10}"`,
                    timeout: 3000,
                })
                .toBe(`zabij ob_${ENEMY_ID + 10}`);
        });
    });

    // -----------------------------------------------------------------------
    // 4. Support bind (Ctrl+Q)
    // -----------------------------------------------------------------------

    test.describe('Support bind (Ctrl+Q)', () => {
        const PLAYER_NUM = 90300;
        const LEADER_ID = 90301;

        test('sends "wesprzyj" and "wesprzyj ob_<leaderId>" when in a team', async ({page}) => {
            // Set up player identity
            await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'SupportHero', object_num: PLAYER_NUM});
            await waitForCharacter(page, 'SupportHero');

            // Player is in team, leader is a different character
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                [String(PLAYER_NUM)]: {desc: 'SupportHero', team: true, team_leader: false, attack_num: false},
                [String(LEADER_ID)]: {desc: 'LeaderChar', team: true, team_leader: true, attack_num: false},
            });
            await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [PLAYER_NUM, LEADER_ID]);

            await resetCommandLog(page);
            await pressKey(page, 'KeyQ', {ctrl: true});

            await expect.poll(async () => {
                const commands = await getCommandLog(page);
                return commands.includes('wesprzyj') && commands.includes(`wesprzyj ob_${LEADER_ID}`);
            }, {
                message: 'should send both wesprzyj and wesprzyj ob_<leaderId>',
                timeout: 3000,
            }).toBe(true);

            const commands = await getCommandLog(page);
            // The bare "wesprzyj" should come before "wesprzyj ob_<id>"
            const bareIndex = commands.indexOf('wesprzyj');
            const targetIndex = commands.indexOf(`wesprzyj ob_${LEADER_ID}`);
            expect(bareIndex).toBeLessThan(targetIndex);
        });

        test('sends only "wesprzyj" when no leader is known', async ({page}) => {
            // Do NOT push any objects.data with team_leader — no leader registered
            await resetCommandLog(page);
            await pressKey(page, 'KeyQ', {ctrl: true});

            await expect.poll(async () => {
                const commands = await getCommandLog(page);
                return commands.includes('wesprzyj');
            }, {
                message: 'should send bare wesprzyj',
                timeout: 3000,
            }).toBe(true);

            const commands = await getCommandLog(page);
            // Only the bare support command should be sent
            const leaderId = commands.find((c) => c.startsWith('wesprzyj ob_'));
            expect(leaderId).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------------
    // 5. Temp bind set via /tbind1
    // -----------------------------------------------------------------------

    test.describe('Temp bind (/tbind1)', () => {
        test('F4 sends the command set via /tbind1', async ({page}) => {
            // Set temp bind via alias
            await submitCommand(page, '/tbind1 ekwipunek');
            await page.waitForTimeout(100); // alias processing — no visible output

            await resetCommandLog(page);
            await pressKey(page, 'F4');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'F4 should send "ekwipunek" after /tbind1 ekwipunek',
                    timeout: 3000,
                })
                .toBe('ekwipunek');
        });

        test('F4 sends a different command when /tbind1 is updated', async ({page}) => {
            await submitCommand(page, '/tbind1 zerknij');
            await page.waitForTimeout(100); // alias processing — no visible output

            await resetCommandLog(page);
            await pressKey(page, 'F4');

            await expect
                .poll(async () => await getLastOutgoingCommand(page), {
                    message: 'F4 should send "zerknij" after /tbind1 zerknij',
                    timeout: 3000,
                })
                .toBe('zerknij');
        });
    });

    // -----------------------------------------------------------------------
    // 6. Temp bind cleared via /tbind1 (no args)
    // -----------------------------------------------------------------------

    test.describe('Temp bind clear (/tbind1 with no args)', () => {
        test('F4 sends nothing after temp bind is cleared', async ({page}) => {
            // Set then clear
            await submitCommand(page, '/tbind1 ekwipunek');
            await page.waitForTimeout(100); // alias processing — no visible output
            await submitCommand(page, '/tbind1');

            await resetCommandLog(page);
            await page.locator('#message-input').focus();
            await pressKey(page, 'F4');
            await page.waitForTimeout(200); // negative assertion — no command sent

            const commands = await getCommandLog(page);
            expect(commands).toHaveLength(0);
        });

        test('F4 sends nothing when /tbind1 has never been set', async ({page}) => {
            // Fresh page — tempBind[0].command is null by default
            await resetCommandLog(page);
            await page.locator('#message-input').focus();
            await pressKey(page, 'F4');
            await page.waitForTimeout(200); // negative assertion — no command sent

            const commands = await getCommandLog(page);
            expect(commands).toHaveLength(0);
        });
    });

});

// ---------------------------------------------------------------------------
// Custom binds from localStorage
// These tests seed localStorage via addInitScript (before page load) so the
// Client constructor reads them on first init — no reload required.
// ---------------------------------------------------------------------------

test.describe('Client keydown handler > Custom binds from localStorage', () => {
    test('custom F6 bind sends the configured command', async ({page}) => {
        // Seed localStorage before the page initialises
        await page.addInitScript(() => {
            localStorage.setItem('binds', JSON.stringify({
                custom: [{key: 'F6', command: 'ekwipunek'}],
            }));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await resetCommandLog(page);
        await pressKey(page, 'F6');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'F6 should send "ekwipunek" from custom bind in localStorage',
                timeout: 3000,
            })
            .toBe('ekwipunek');
    });

    test('custom Ctrl+F6 bind does not fire without the Ctrl modifier', async ({page}) => {
        await page.addInitScript(() => {
            localStorage.setItem('binds', JSON.stringify({
                custom: [{key: 'F6', ctrl: true, command: 'ekwipunek'}],
            }));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await resetCommandLog(page);
        await page.locator('#message-input').focus();
        await pressKey(page, 'F6'); // no Ctrl modifier
        await page.waitForTimeout(200); // negative assertion — no command sent

        const commands = await getCommandLog(page);
        expect(commands).toHaveLength(0);
    });

    test('custom Ctrl+F6 bind fires with Ctrl modifier', async ({page}) => {
        await page.addInitScript(() => {
            localStorage.setItem('binds', JSON.stringify({
                custom: [{key: 'F6', ctrl: true, command: 'zerknij'}],
            }));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await resetCommandLog(page);
        await pressKey(page, 'F6', {ctrl: true});

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'Ctrl+F6 should send "zerknij" from custom bind',
                timeout: 3000,
            })
            .toBe('zerknij');
    });
});
