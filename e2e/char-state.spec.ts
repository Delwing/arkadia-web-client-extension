import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, pushGmcp, waitForCommandInput} from './support/mocks';

const MENU_BUTTON = '#menu-button';
const UI_SETTINGS_BUTTON = '#ui-settings-button';
const UI_MODAL = '#ui-settings-modal';
const FOOTER_MODE_SELECT = '#ui-footer-mode';
const EMOJI_LABELS_CHECKBOX = '#ui-emoji-labels';

async function openUiSettings(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(UI_SETTINGS_BUTTON);
    const modal = page.locator(UI_MODAL);
    await expect(modal, 'should open UI settings modal').toBeVisible();
    await modal.getByRole('button', {name: 'Stopka', exact: true}).click();
    return modal;
}

async function setFooterMode(page: Page, mode: number) {
    const modal = await openUiSettings(page);
    await modal.locator(FOOTER_MODE_SELECT).selectOption(String(mode));
    await modal.locator('#ui-settings-save').click();
    await expect(modal, 'should close UI settings modal after saving').not.toBeVisible();
}

async function setEmojiLabels(page: Page, enabled: boolean) {
    const modal = await openUiSettings(page);
    const checkbox = modal.locator(EMOJI_LABELS_CHECKBOX);

    if (enabled) {
        if (!(await checkbox.isChecked())) {
            await checkbox.check();
        }
    } else {
        if (await checkbox.isChecked()) {
            await checkbox.uncheck();
        }
    }

    await modal.locator('#ui-settings-save').click();
    await expect(modal, 'should close UI settings modal after saving').not.toBeVisible();
}

test.describe('Character state', () => {
    test('displays character stats in text mode', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const charStateText = page.locator('#char-state-text');

        // Send initial character state via GMCP
        await pushGmcp(page, 'char.state', {
            hp: 5,
            mana: 6,
            fatigue: 3,
            improve: 5,
        });

        // Verify stats are displayed
        await expect(charStateText, 'should be visible').toBeVisible();
        await expect(charStateText, 'should display HP').toContainText('HP');
        await expect(charStateText, 'should display MANA').toContainText('MANA');
        await expect(charStateText, 'should display fatigue').toContainText('ZM');
        await expect(charStateText, 'should display improve').toContainText('POS');
    });

    test('only displays non-default values', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const charStateText = page.locator('#char-state-text');

        // Send state with default values for some stats
        await pushGmcp(page, 'char.state', {
            hp: 5,
            mana: 8, // default value
            fatigue: 3,
            stuffed: 3, // default value
            encumbrance: 0, // default value
        });

        // Verify only non-default values are displayed
        await expect(charStateText, 'should display HP').toContainText('HP');
        await expect(charStateText, 'should display fatigue').toContainText('ZM');
        await expect(charStateText, 'should not display mana with default value').not.toContainText('MANA');
        await expect(charStateText, 'should not display stuffed with default value').not.toContainText('GLO');
        await expect(charStateText, 'should not display encumbrance with default value').not.toContainText('OBC');
    });

    test('displays bars mode when footer mode is 3', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const charStateBars = page.locator('#char-state-bars');
        const charStateText = page.locator('#char-state-text');

        // Set footer mode to 3 (bars) via UI
        await setFooterMode(page, 3);

        // Send character state
        await pushGmcp(page, 'char.state', {
            hp: 4,
            fatigue: 5,
        });

        // Verify bars are visible and text is hidden
        await expect(charStateBars, 'should display bars mode').toBeVisible();
        await expect(charStateText, 'should hide text mode').not.toBeVisible();

        // Check that bars are rendered
        const bars = charStateBars.locator('.char-state-bar');
        await expect(bars, 'should render character state bars').toHaveCount(2);
    });

    test('switches between text and emoji labels', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const charStateText = page.locator('#char-state-text');

        // Send character state
        await pushGmcp(page, 'char.state', {
            hp: 5,
            fatigue: 3,
        });

        // Verify text labels initially
        await expect(charStateText, 'should display HP text label').toContainText('HP');
        await expect(charStateText, 'should display fatigue text label').toContainText('ZM');

        // Switch to emoji labels via UI
        await setEmojiLabels(page, true);

        // Resend character state to trigger re-render
        await pushGmcp(page, 'char.state', {
            hp: 5,
            fatigue: 3,
        });

        // Verify emoji labels
        await expect(charStateText, 'should display HP emoji').toContainText('❤');
        await expect(charStateText, 'should display fatigue emoji').toContainText('💤');
    });

    test('highlights extreme values in tomato color', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const charStateText = page.locator('#char-state-text');

        // Send state with extreme values (encumbrance at max, stuffed at 0)
        await pushGmcp(page, 'char.state', {
            hp: 5,
            encumbrance: 6, // max value, opposite of default (0)
            stuffed: 0, // min value, opposite of default (3)
        });

        // Check that extreme values are highlighted
        const html = await charStateText.innerHTML();
        expect(html, 'should highlight extreme values with tomato color').toContain('tomato');
    });

    test('displays HP with transformed values (value+1, max+1)', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const charStateText = page.locator('#char-state-text');

        // Send HP value of 5 (should display as 6/7)
        await pushGmcp(page, 'char.state', {
            hp: 5,
        });

        // Verify HP is transformed
        await expect(charStateText, 'should transform HP value').toContainText('[6/7]');
    });

    test('hides form stat when both state.form and options.form are 0', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const charStateText = page.locator('#char-state-text');

        // Send options with form=0
        await pushGmcp(page, 'char.options', {
            form: 0,
        });

        // Send state with form=0
        await pushGmcp(page, 'char.state', {
            hp: 5,
            form: 0,
        });

        // Verify form is not displayed
        await expect(charStateText, 'should not display form when disabled').not.toContainText('FOR');
    });

    test('displays bar mode with different bar lengths in mode 1 and 2', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const charStateText = page.locator('#char-state-text');

        // Set footer mode to 1 (bars with variable length) via UI
        await setFooterMode(page, 1);

        // Send character state
        await pushGmcp(page, 'char.state', {
            hp: 4, // 5/7 after transform
            fatigue: 6,
        });

        // Verify bars with # and - characters are rendered
        const html = await charStateText.innerHTML();
        expect(html, 'should render bar with # characters').toContain('#');
        expect(html, 'should render bar with - characters').toContain('-');
    });
});
