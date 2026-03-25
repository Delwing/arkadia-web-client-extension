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

async function openBindsModal(page: Page): Promise<void> {
    await page.click('#menu-button');
    await page.click('#binds-button');
    await page.waitForSelector('#binds-modal.show', {timeout: 5000});
    await page.waitForSelector('#binds-modal .form-select', {timeout: 5000});
}

async function saveBindsModal(page: Page): Promise<void> {
    await page.locator('#binds-modal button:has-text("Zapisz")').click();
    await page.waitForSelector('#binds-modal.show', {state: 'hidden', timeout: 5000});
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
        await openBindsModal(page);

        const lampInput = page
            .locator('#binds-modal tr', {hasText: 'lamp'})
            .locator('input[type="text"]');
        await expect(lampInput).toBeVisible();

        await lampInput.focus();
        await page.keyboard.press('F9');
        await page.waitForTimeout(100);

        await expect(lampInput).toHaveValue('F9');

        await saveBindsModal(page);

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
        await openBindsModal(page);

        // Use "Atakuj" exactly (not "Atakuj wroga") — first row matching "Atakuj"
        const attackInput = page
            .locator('#binds-modal tr', {hasText: 'Atakuj'})
            .first()
            .locator('input[type="text"]');
        await expect(attackInput).toBeVisible();

        await attackInput.focus();
        await page.keyboard.press('F10');
        await page.waitForTimeout(100);

        await expect(attackInput).toHaveValue('F10');

        await saveBindsModal(page);

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
        await openBindsModal(page);

        // Find the "N" row by matching the first <td> with exactly "N"
        const nInput = page
            .locator('#binds-modal tr')
            .filter({has: page.locator('td.w-32', {hasText: /^N$/})})
            .locator('input[type="text"]');
        await expect(nInput).toBeVisible();

        await nInput.focus();
        await page.keyboard.press('F7');
        await page.waitForTimeout(100);

        await expect(nInput).toHaveValue('F7');

        await saveBindsModal(page);

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
        await openBindsModal(page);

        const funcInput = page
            .locator('#binds-modal tr', {hasText: 'Funkcyjny'})
            .locator('input[type="text"]');
        await expect(funcInput).toBeVisible();

        await funcInput.focus();
        await page.keyboard.press('Backslash');
        await page.waitForTimeout(100);

        await expect(funcInput).toHaveValue('Backslash');

        await saveBindsModal(page);

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

        await openBindsModal(page);

        // Find the drinkable row by searching for "wody" text
        const drinkableInput = page
            .locator('#binds-modal tr', {hasText: 'wody'})
            .locator('input[type="text"]');
        await expect(drinkableInput).toBeVisible();

        await drinkableInput.focus();
        await page.keyboard.press('F11');
        await page.waitForTimeout(100);

        await expect(drinkableInput).toHaveValue('F11');

        await saveBindsModal(page);

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
        await openBindsModal(page);

        const lampInput = page
            .locator('#binds-modal tr', {hasText: 'lamp'})
            .locator('input[type="text"]');
        await expect(lampInput).toBeVisible();

        await lampInput.focus();
        await page.keyboard.press('F9');
        await page.waitForTimeout(100);

        await expect(lampInput).toHaveValue('F9');

        await saveBindsModal(page);

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
