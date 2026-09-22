import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    getLastOutgoingCommand,
    GMCP_PATHS,
    primeCharInfo,
    pushGmcp,
    pushText,
    resetCommandLog,
    waitForCharacter,
    waitForCommandInput,
} from './support/mocks';
import type {Page} from '@playwright/test';
import {bindKey, captureKey, closeKeysWindow, openKeysWindow} from './support/keys';

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
// Test suites
// ---------------------------------------------------------------------------

test.describe('Bind capture via UI: lamp bind', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page);
    });

    // -----------------------------------------------------------------------
    // 1. Reassign lamp bind via capture, verify new key works at runtime
    // -----------------------------------------------------------------------

    test('reassigned lamp bind (F9) sends "napelnij lampe olejem"; old Ctrl+4 no longer fires', async ({page}) => {
        // Open binds modal and capture F9 for the lamp bind
        await openKeysWindow(page);

        const lampInput = bindKey(page, 'slot:lamp');
        await captureKey(page, 'slot:lamp', 'F9');
        await expect(lampInput).toHaveText('F9');

        await closeKeysWindow(page);

        // F9 should now send the lamp command
        await resetCommandLog(page);
        await pressKey(page, 'F9');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'F9 should send "napelnij lampe olejem" after capture',
                timeout: 3000,
            })
            .toBe('napelnij lampe olejem');

        // Old Ctrl+4 should no longer trigger the lamp command
        await resetCommandLog(page);
        await page.locator('#message-input').focus();
        await pressKey(page, 'Digit4', {ctrl: true});
        await page.waitForTimeout(300);

        const commands = await getCommandLog(page);
        const lampCommands = commands.filter(c => c === 'napelnij lampe olejem');
        expect(lampCommands).toHaveLength(0);
    });
});

test.describe('Bind capture via UI: attack bind', () => {
    const PLAYER_NUM = 92000;
    const ENEMY_ID = 92001;

    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Establish character identity so character-scoped settings work
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'BindCaptureHero', object_num: PLAYER_NUM});
        await waitForCharacter(page, 'BindCaptureHero');
    });

    // -----------------------------------------------------------------------
    // 2. Reassign attack bind via capture, verify new key works
    // -----------------------------------------------------------------------

    test('reassigned attack bind (F10) sends "zabij ob_<id>"; old Ctrl+1 no longer fires', async ({page}) => {
        // Register an attack target enemy
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            [String(PLAYER_NUM)]: {desc: 'BindCaptureHero', team: false, attack_num: false},
            [String(ENEMY_ID)]: {desc: 'TestGoblin', attack_num: false, attack_target: true},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [PLAYER_NUM, ENEMY_ID]);

        // Open binds modal and capture F10 for the attack bind
        await openKeysWindow(page);

        // Use "Atakuj" exactly (not "Atakuj wroga") — first row matching "Atakuj"
        const attackInput = bindKey(page, 'slot:attack');
        await captureKey(page, 'slot:attack', 'F10');
        await expect(attackInput).toHaveText('F10');

        await closeKeysWindow(page);

        // F10 should now send the attack command
        await resetCommandLog(page);
        await pressKey(page, 'F10');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: `F10 should send "zabij ob_${ENEMY_ID}" after capture`,
                timeout: 3000,
            })
            .toBe(`zabij ob_${ENEMY_ID}`);

        // Old Ctrl+1 should no longer trigger attack
        await resetCommandLog(page);
        await pressKey(page, 'Digit1', {ctrl: true});
        await page.waitForTimeout(300);

        const commands = await getCommandLog(page);
        const attackCommands = commands.filter(c => c === `zabij ob_${ENEMY_ID}`);
        expect(attackCommands).toHaveLength(0);
    });
});

test.describe('Bind capture via UI: direction bind (N)', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page);
    });

    // -----------------------------------------------------------------------
    // 3. Reassign direction bind N via capture, verify new key works
    // -----------------------------------------------------------------------

    test('reassigned N direction bind (F7) sends "n"; old Numpad8 no longer fires', async ({page}) => {
        await openKeysWindow(page);

        // Find the "N" row by matching the first <td> with exactly "N"
        const nInput = bindKey(page, 'slot:directions.n');
        await captureKey(page, 'slot:directions.n', 'F7');
        await expect(nInput).toHaveText('F7');

        await closeKeysWindow(page);

        // F7 should now send "n"
        await resetCommandLog(page);
        await pressKey(page, 'F7');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'F7 should send "n" after direction bind capture',
                timeout: 3000,
            })
            .toBe('n');

        // Old Numpad8 should no longer send "n"
        await resetCommandLog(page);
        await page.locator('#message-input').focus();
        await pressKey(page, 'Numpad8');
        await page.waitForTimeout(300);

        const commands = await getCommandLog(page);
        expect(commands).toHaveLength(0);
    });
});

test.describe('Bind capture via UI: functional bind', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page);
    });

    // -----------------------------------------------------------------------
    // 4. Reassign functional bind via capture, verify new key works
    // -----------------------------------------------------------------------

    test('reassigned functional bind (Backslash) fires "usiadz"; old BracketRight no longer fires', async ({page}) => {
        await openKeysWindow(page);

        const funcInput = bindKey(page, 'slot:main');
        await captureKey(page, 'slot:main', 'Backslash');
        await expect(funcInput).toHaveText('\\');

        await closeKeysWindow(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger a functional bind via seat prompt
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        // Press Backslash — should fire the bind
        await resetCommandLog(page);
        await page.keyboard.press('Backslash');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'Backslash should send "usiadz" after functional bind capture',
                timeout: 3000,
            })
            .toBe('usiadz');

        // Trigger the bind again so BracketRight can be tested
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');
        await expect(output).toContainText('usiadz');

        // Old BracketRight should no longer fire the functional bind
        await resetCommandLog(page);
        await page.keyboard.press('BracketRight');
        await page.waitForTimeout(300);

        const commands = await getCommandLog(page);
        expect(commands).toHaveLength(0);
    });
});

test.describe('Bind capture via UI: drinkable bind', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page);
    });

    // -----------------------------------------------------------------------
    // 5. Reassign drinkable bind (Alt+N → F11) via capture
    // -----------------------------------------------------------------------

    test('reassigned drinkable bind (F11) sends "napij sie do syta wody"; old Alt+N no longer fires', async ({page}) => {
        // Set up a room first so the drinkable bind has something to act on
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 9200,
            name: 'Rzeka testowa',
            exits: {n: 9201},
        });

        await openKeysWindow(page);

        // Find the drinkable row by searching for "wody" text
        const drinkableInput = bindKey(page, 'slot:drinkable');
        await captureKey(page, 'slot:drinkable', 'F11');
        await expect(drinkableInput).toHaveText('F11');

        await closeKeysWindow(page);

        // F11 should now send the drink command
        await resetCommandLog(page);
        await pressKey(page, 'F11');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'F11 should send "napij sie do syta wody" after drinkable bind capture',
                timeout: 3000,
            })
            .toBe('napij sie do syta wody');

        // Old Alt+N should no longer trigger the drink command
        await resetCommandLog(page);
        await pressKey(page, 'KeyN', {alt: true});
        await page.waitForTimeout(300);

        const commands = await getCommandLog(page);
        const drinkCommands = commands.filter(c => c === 'napij sie do syta wody');
        expect(drinkCommands).toHaveLength(0);
    });
});

test.describe('Bind capture via UI: mid-session change', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page);
    });

    // -----------------------------------------------------------------------
    // 6. Mid-session: lamp bind works with default key, then user reassigns
    // -----------------------------------------------------------------------

    test('lamp bind works with default Ctrl+4, then reassigned to F9, then Ctrl+4 no longer fires', async ({page}) => {
        // Verify the default Ctrl+4 lamp bind works before any change
        await resetCommandLog(page);
        await pressKey(page, 'Digit4', {ctrl: true});

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'Ctrl+4 should send "napelnij lampe olejem" with default bind',
                timeout: 3000,
            })
            .toBe('napelnij lampe olejem');

        // Open binds modal and reassign lamp bind to F9
        await openKeysWindow(page);

        const lampInput = bindKey(page, 'slot:lamp');
        await captureKey(page, 'slot:lamp', 'F9');
        await expect(lampInput).toHaveText('F9');

        await closeKeysWindow(page);

        // F9 should now send the lamp command
        await resetCommandLog(page);
        await pressKey(page, 'F9');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'F9 should send "napelnij lampe olejem" after mid-session capture',
                timeout: 3000,
            })
            .toBe('napelnij lampe olejem');

        // Ctrl+4 must no longer trigger the lamp command
        await resetCommandLog(page);
        await page.locator('#message-input').focus();
        await pressKey(page, 'Digit4', {ctrl: true});
        await page.waitForTimeout(300);

        const commands = await getCommandLog(page);
        const lampCommands = commands.filter(c => c === 'napelnij lampe olejem');
        expect(lampCommands).toHaveLength(0);
    });
});
