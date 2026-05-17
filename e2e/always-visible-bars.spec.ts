import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, pushGmcp, waitForCommandInput} from './support/mocks';

const MENU_BUTTON = '#menu-button';
const UI_SETTINGS_BUTTON = '#ui-settings-button';
const UI_MODAL = '#ui-settings-modal';
const SAVE_BUTTON = '#ui-settings-save';

// IDs used by the BarOrderSettings React component (no 'ui-' prefix)
const AVB_ALL = '#avb-all';
const AVB_MANA = '#avb-mana';
const AVB_STUFFED = '#avb-stuffed';
const AVB_ENCUMBRANCE = '#avb-encumbrance';
const AVB_SOAKED = '#avb-soaked';
const AVB_IMPROVE = '#avb-improve';
const AVB_FORM = '#avb-form';
const AVB_INTOX = '#avb-intox';
const AVB_HEADACHE = '#avb-headache';
const AVB_PANIC = '#avb-panic';

// All bar IDs that have a default value (HP and fatigue do NOT have always-visible toggles)
const ALL_AVB_IDS = [
    AVB_MANA, AVB_STUFFED, AVB_ENCUMBRANCE,
    AVB_SOAKED, AVB_IMPROVE, AVB_FORM,
    AVB_INTOX, AVB_HEADACHE, AVB_PANIC,
];

async function openUiSettings(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(UI_SETTINGS_BUTTON);
    const modal = page.locator(UI_MODAL);
    await expect(modal, 'should open UI settings modal').toBeVisible();
    // Wait for the bar-order React component to mount
    await modal.locator('#ui-bar-order-settings').waitFor({state: 'visible'});
    await modal.locator(AVB_ALL).waitFor({state: 'visible'});
    return modal;
}

async function saveAndClose(_page: Page, modal: ReturnType<Page['locator']>) {
    await modal.locator(SAVE_BUTTON).click();
    await expect(modal, 'should close UI settings modal after saving').not.toBeVisible();
}

// Push a char.state GMCP packet and wait briefly for the DOM to update.
async function pushCharState(page: Page, state: Record<string, number>) {
    await pushGmcp(page, 'char.state', state);
    // Allow the DOM to react to the GMCP event
    await page.waitForTimeout(200);
}

// Wait until localStorage uiSettings contains all of the given alwaysVisibleBars keys.
async function waitForAlwaysVisibleBars(page: Page, keys: string[]): Promise<void> {
    await page.waitForFunction((expectedKeys: string[]) => {
        try {
            const storageKeys = Object.keys(localStorage);
            const key = storageKeys.find((k) => k === 'uiSettings' || k.endsWith(':uiSettings'));
            if (!key) return false;
            const parsed = JSON.parse(localStorage.getItem(key) ?? 'null');
            if (!Array.isArray(parsed?.alwaysVisibleBars)) return false;
            return expectedKeys.every((k) => parsed.alwaysVisibleBars.includes(k));
        } catch {
            return false;
        }
    }, keys);
}

test.describe('Always visible status bars', () => {
    test('bars at default value are hidden by default', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const charStateText = page.locator('#char-state-text');

        // mana default = 8, stuffed default = 3, encumbrance default = 0
        await pushCharState(page, {
            hp: 5,
            mana: 8,
            stuffed: 3,
            encumbrance: 0,
        });

        await expect(charStateText, 'should display HP (no default, always shown)').toContainText('HP');
        await expect(charStateText, 'should hide mana at its default value').not.toContainText('MANA');
        await expect(charStateText, 'should hide stuffed at its default value').not.toContainText('GLO');
        await expect(charStateText, 'should hide encumbrance at its default value').not.toContainText('OBC');
    });

    test('checking mana toggle makes mana visible even at default value', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const charStateText = page.locator('#char-state-text');

        // Push default mana value — should be hidden before setting change
        await pushCharState(page, {hp: 5, mana: 8});
        await expect(charStateText, 'mana should be hidden before enabling always-visible').not.toContainText('MANA');

        // Enable always-visible for mana via the settings UI
        const modal = await openUiSettings(page);
        const manaSwitch = modal.locator(AVB_MANA);
        if (!(await manaSwitch.isChecked())) {
            await manaSwitch.check();
        }
        await saveAndClose(page, modal);

        // Wait for the setting to be persisted
        await waitForAlwaysVisibleBars(page, ['mana']);

        // Re-send the same default mana value to trigger a re-render — it should now be visible
        await pushCharState(page, {hp: 5, mana: 8});
        await expect(charStateText, 'mana should be visible after enabling always-visible').toContainText('MANA');
    });

    test('always-visible setting persists after page reload', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Enable always-visible for stuffed via the settings UI
        const modal = await openUiSettings(page);
        const stuffedSwitch = modal.locator(AVB_STUFFED);
        if (!(await stuffedSwitch.isChecked())) {
            await stuffedSwitch.check();
        }
        await saveAndClose(page, modal);

        // Verify the setting is persisted in localStorage
        await waitForAlwaysVisibleBars(page, ['stuffed']);

        // Reload the page
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Push stuffed at its default value — should still be visible after reload
        await pushCharState(page, {hp: 5, stuffed: 3});
        const charStateText = page.locator('#char-state-text');
        await expect(
            charStateText,
            'stuffed should be visible at default after reload when always-visible is enabled',
        ).toContainText('GLO');

        // Confirm the toggle is still checked in the settings modal
        const reloadedModal = await openUiSettings(page);
        await expect(
            reloadedModal.locator(AVB_STUFFED),
            'stuffed toggle should remain checked after reload',
        ).toBeChecked();
    });

    test('disabling always-visible hides the bar again when value is at default', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Enable always-visible for soaked first
        const modal = await openUiSettings(page);
        const soakedSwitch = modal.locator(AVB_SOAKED);
        if (!(await soakedSwitch.isChecked())) {
            await soakedSwitch.check();
        }
        await saveAndClose(page, modal);

        await waitForAlwaysVisibleBars(page, ['soaked']);

        // soaked default = 3, confirm it is visible at its default
        await pushCharState(page, {hp: 5, soaked: 3});
        const charStateText = page.locator('#char-state-text');
        await expect(charStateText, 'soaked should be visible when always-visible is enabled').toContainText('PRA');

        // Disable always-visible for soaked
        const modal2 = await openUiSettings(page);
        const soakedSwitch2 = modal2.locator(AVB_SOAKED);
        if (await soakedSwitch2.isChecked()) {
            await soakedSwitch2.uncheck();
        }
        await saveAndClose(page, modal2);

        // Re-send soaked at its default value — should be hidden again
        await pushCharState(page, {hp: 5, soaked: 3});
        await expect(charStateText, 'soaked should be hidden again after disabling always-visible').not.toContainText('PRA');
    });

    test('"Wszystkie zawsze widoczne" toggle checks all individual switches', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openUiSettings(page);
        const allSwitch = modal.locator(AVB_ALL);

        // Ensure all individual switches start unchecked
        for (const id of ALL_AVB_IDS) {
            const sw = modal.locator(id);
            if (await sw.isChecked()) {
                await sw.uncheck();
            }
        }
        await expect(allSwitch, 'select-all should be unchecked when none are selected').not.toBeChecked();

        // Enable the select-all toggle
        await allSwitch.check();

        // Every individual switch should now be checked
        for (const id of ALL_AVB_IDS) {
            await expect(
                modal.locator(id),
                `${id} should be checked after enabling select-all`,
            ).toBeChecked();
        }

        await saveAndClose(page, modal);

        // Verify the stored setting contains all stat keys
        const stored = await page.evaluate(() => {
            try {
                const keys = Object.keys(localStorage);
                const key = keys.find((k) => k === 'uiSettings' || k.endsWith(':uiSettings'));
                if (!key) return null;
                const parsed = JSON.parse(localStorage.getItem(key) ?? 'null');
                return parsed?.alwaysVisibleBars ?? null;
            } catch {
                return null;
            }
        });
        expect(stored, 'all stat keys should be saved in alwaysVisibleBars').toEqual(
            expect.arrayContaining(['mana', 'stuffed', 'encumbrance', 'soaked', 'improve', 'form', 'intox', 'headache', 'panic']),
        );
    });

    test('"Wszystkie zawsze widoczne" toggle unchecks all individual switches', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openUiSettings(page);
        const allSwitch = modal.locator(AVB_ALL);

        // First, enable all via the select-all toggle
        if (!(await allSwitch.isChecked())) {
            await allSwitch.check();
        }
        for (const id of ALL_AVB_IDS) {
            await expect(modal.locator(id), `${id} should be checked after select-all`).toBeChecked();
        }

        // Now disable via the select-all toggle
        await allSwitch.uncheck();

        for (const id of ALL_AVB_IDS) {
            await expect(
                modal.locator(id),
                `${id} should be unchecked after disabling select-all`,
            ).not.toBeChecked();
        }

        await saveAndClose(page, modal);
    });

    test('"Wszystkie zawsze widoczne" reflects true when all individual switches are manually checked', async ({page}) => {
        test.slow();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openUiSettings(page);
        const allSwitch = modal.locator(AVB_ALL);

        // Ensure none are checked initially
        for (const id of ALL_AVB_IDS) {
            const sw = modal.locator(id);
            if (await sw.isChecked()) {
                await sw.uncheck();
            }
        }
        await expect(allSwitch, 'select-all should be unchecked initially').not.toBeChecked();

        // Manually check each individual switch
        for (const id of ALL_AVB_IDS) {
            await modal.locator(id).check();
        }

        // The select-all switch should now reflect the checked state
        await expect(
            allSwitch,
            'select-all should become checked when all individual switches are manually checked',
        ).toBeChecked();

        await saveAndClose(page, modal);
    });

    test('multiple bars can be set to always visible simultaneously', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Enable always-visible for mana, improve, and intox
        const modal = await openUiSettings(page);
        const manaSwitch = modal.locator(AVB_MANA);
        const improveSwitch = modal.locator(AVB_IMPROVE);
        const intoxSwitch = modal.locator(AVB_INTOX);
        if (!(await manaSwitch.isChecked())) await manaSwitch.check();
        if (!(await improveSwitch.isChecked())) await improveSwitch.check();
        if (!(await intoxSwitch.isChecked())) await intoxSwitch.check();
        await saveAndClose(page, modal);

        await waitForAlwaysVisibleBars(page, ['mana', 'improve', 'intox']);

        // Push default values for all three: mana=8, improve=0, intox=0
        await pushCharState(page, {hp: 5, mana: 8, improve: 0, intox: 0});

        const charStateText = page.locator('#char-state-text');
        await expect(charStateText, 'mana should be visible at its default value').toContainText('MANA');
        await expect(charStateText, 'improve should be visible at its default value').toContainText('POS');
        await expect(charStateText, 'intox should be visible at its default value').toContainText('UPI');
    });

    test('bars not at default value still show regardless of always-visible setting', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const charStateText = page.locator('#char-state-text');

        // No always-visible settings changed — push non-default values
        await pushCharState(page, {
            hp: 5,
            mana: 4,        // non-default (default is 8)
            encumbrance: 3, // non-default (default is 0)
        });

        await expect(charStateText, 'mana should show when not at its default value').toContainText('MANA');
        await expect(charStateText, 'encumbrance should show when not at its default value').toContainText('OBC');
    });

    test('only the always-visible bar shows when two defaults are at default and one has always-visible', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Enable always-visible only for headache (default = 0), leaving panic unconfigured
        const modal = await openUiSettings(page);
        const headacheSwitch = modal.locator(AVB_HEADACHE);
        if (!(await headacheSwitch.isChecked())) {
            await headacheSwitch.check();
        }
        await saveAndClose(page, modal);

        await waitForAlwaysVisibleBars(page, ['headache']);

        // headache=0 (default, but always-visible), panic=0 (default, NOT always-visible)
        await pushCharState(page, {hp: 5, headache: 0, panic: 0});

        const charStateText = page.locator('#char-state-text');
        await expect(charStateText, 'headache should be visible due to always-visible setting').toContainText('KAC');
        await expect(charStateText, 'panic should remain hidden (at default, not always-visible)').not.toContainText('PAN');
    });
});
