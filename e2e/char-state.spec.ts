import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, pushGmcp, waitForCommandInput} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';

const FOOTER_MODE_SELECT = '#ui-footer-mode';
const EMOJI_LABELS_CHECKBOX = '#ui-emoji-labels';

async function openUiSettings(page: Page) {
    return openSettings(page, 'ui-footer');
}

async function setFooterMode(page: Page, mode: number) {
    const modal = await openUiSettings(page);
    await modal.locator(FOOTER_MODE_SELECT).selectOption(String(mode));
    await saveSettings(page);
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

    await saveSettings(page);
}

test.describe('Character state', () => {
    test('displays character stats', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const charStateText = page.locator('#char-state-vitals');

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

        const charStateText = page.locator('#char-state-vitals');

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

        const vitals = page.locator('#char-state-vitals');

        // Set footer mode to 3 (graphic bars) via UI
        await setFooterMode(page, 3);

        // Send character state
        await pushGmcp(page, 'char.state', {
            hp: 4,
            fatigue: 5,
        });

        // One meter per shown stat, with the numbers on it
        const bars = vitals.locator('.vital__bar');
        await expect(bars, 'should render character state bars').toHaveCount(2);
        await expect(bars.first(), 'should show the numbers').toHaveText('5/7');
    });

    test('switches between text and emoji labels', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const charStateText = page.locator('#char-state-vitals');

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

        const charStateText = page.locator('#char-state-vitals');

        // Send state with extreme values (encumbrance at max, stuffed at 0)
        await pushGmcp(page, 'char.state', {
            hp: 5,
            encumbrance: 6, // max value, opposite of default (0)
            stuffed: 0, // min value, opposite of default (3)
        });

        // Stats at the far end from where they rest are flagged
        await expect(charStateText.locator('.vital--alert'), 'should flag both extreme values').toHaveCount(2);
        await expect(charStateText.locator('.vital--alert[data-vital="encumbrance"]')).toHaveCount(1);
        await expect(charStateText.locator('.vital--alert[data-vital="stuffed"]')).toHaveCount(1);
    });

    test('displays HP with transformed values (value+1, max+1)', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const charStateText = page.locator('#char-state-vitals');

        // Send HP value of 5 (should display as 6/7)
        await pushGmcp(page, 'char.state', {
            hp: 5,
        });

        // Verify HP is transformed: 6 of 7 pips, and 6/7 in the numeric mode
        const hp = charStateText.locator('.vital[data-vital="hp"]');
        await expect(hp.locator('.vital__pip'), 'should draw one pip per point').toHaveCount(7);
        await expect(hp.locator('.vital__pip.is-on'), 'should fill value+1 pips').toHaveCount(6);
        await setFooterMode(page, 0);
        await expect(hp.locator('.vital__text'), 'should transform HP value').toHaveText('6/7');
    });

    test('hides form stat when both state.form and options.form are 0', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const charStateText = page.locator('#char-state-vitals');

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

        const charStateText = page.locator('#char-state-vitals');

        // Set footer mode to 1 (bars with variable length) via UI
        await setFooterMode(page, 1);

        // Send character state
        await pushGmcp(page, 'char.state', {
            hp: 4, // 5/7 after transform
            fatigue: 6,
        });

        // One mark per point in mode 1, a fixed 10 in mode 2
        const hp = charStateText.locator('.vital[data-vital="hp"] .vital__text');
        await expect(hp, 'should render the bar with one mark per point').toHaveText('[#####--]');
        await setFooterMode(page, 2);
        await expect(hp, 'should render the fixed-length bar').toHaveText('[#######---]');
    });
});
