import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, pushGmcp, submitCommand, waitForCommandInput} from './support/mocks';

/**
 * The phone footer (src/web/mobileFooter.ts + footerMobile.css).
 *
 * What is being pinned here is that the footer stops resizing itself. Its
 * contents are dynamic on both axes - the player picks which chips exist, and
 * how many stat bars show depends on the character's condition - so the old
 * wrapping row changed height several times a minute on a phone and shoved the
 * game output around. The rails scroll sideways instead, and only the expander
 * changes the footer's height.
 */

const PHONE = {width: 390, height: 844};

const MENU_BUTTON = '#menu-button';
const UI_SETTINGS_BUTTON = '#ui-settings-button';
const UI_SETTINGS_MODAL = '#ui-settings-modal';

/** A quiet character: a couple of stats worth showing, nothing else. */
const CALM_STATE = {hp: 5, mana: 6, fatigue: 3, improve: 5};

/** Everything at once: every stat off its resting value, so every bar shows. */
const BUSY_STATE = {
    hp: 2, mana: 3, fatigue: 7, stuffed: 0, encumbrance: 5, soaked: 0,
    improve: 9, form: 1, intox: 5, headache: 4, panic: 3,
};

async function footerHeight(page: Page): Promise<number> {
    const box = await page.locator('#char-state').boundingBox();
    if (!box) throw new Error('footer has no box');
    return box.height;
}

/** Does a rail hold more than fits, i.e. is it scrolling rather than wrapping? */
async function railOverflow(page: Page, selector: string) {
    return page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement;
        if (!el) throw new Error(`no ${sel}`);
        return {scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight};
    }, selector);
}

async function openFooterSettings(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(UI_SETTINGS_BUTTON);
    const modal = page.locator(UI_SETTINGS_MODAL);
    await expect(modal, 'should open UI settings modal').toBeVisible();
    await modal.getByRole('button', {name: 'Stopka', exact: true}).click();
    return modal;
}

test.describe('Mobile footer', () => {
    test.use({viewport: PHONE});

    test('shows compact stat meters instead of the footer text line', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.state', CALM_STATE);

        const meters = page.locator('.char-state-bar--mini');
        await expect(meters, 'every shown stat should be a compact meter').toHaveCount(4);
        await expect(page.locator('#char-state-text'), 'the desktop text line is not used').toBeHidden();

        // A meter carries the label, the numbers and a filled track - the same
        // information the desktop bar has, in a third of the width.
        const hp = page.locator('.char-state-bar--mini[title="hp"]');
        await expect(hp.locator('.char-state-mini-label')).toHaveText('HP');
        await expect(hp.locator('.char-state-mini-value')).toHaveText('6/7');
        await expect(hp.locator('.char-state-mini-fill')).toBeVisible();
    });

    test('keeps one height while stats and chips come and go', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.state', CALM_STATE);
        await expect(page.locator('.char-state-bar--mini')).toHaveCount(4);
        const quiet = await footerHeight(page);

        // Everything the game can throw at the footer at once.
        await pushGmcp(page, 'char.state', BUSY_STATE);
        await pushGmcp(page, 'mail.state', {unreceived: true, unsent: true});
        await expect(page.locator('.char-state-bar--mini')).toHaveCount(11);
        await expect(page.locator('#mail-status')).toBeVisible();

        expect(await footerHeight(page), 'footer height must not move with its contents').toBe(quiet);

        // ... because the rails scroll sideways rather than wrapping.
        const vitals = await railOverflow(page, '#char-state-vitals');
        expect(vitals.scrollWidth, 'vitals rail should hold more than fits').toBeGreaterThan(vitals.clientWidth);
        expect(vitals.scrollHeight, 'vitals rail should stay one line high').toBeLessThanOrEqual(vitals.clientHeight + 1);
    });

    // A chip is a pill, and pills of different heights in one row read as a
    // mistake. The pipe is an icon and several chips carry a bigger glyph than
    // their neighbours' text, so this is only true while the pill's line box is
    // a fixed length rather than a multiplier of each chip's own font.
    test('gives every chip in the rail the same height', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.state', CALM_STATE);
        await pushGmcp(page, 'mail.state', {unreceived: true, unsent: true});
        await expect(page.locator('#mail-status')).toBeVisible();

        const chips = await page.evaluate(() => Array.from(document.getElementById('footer-chips')!.children)
            .filter((el) => el.id !== 'plugin-footer-components' && getComputedStyle(el).display !== 'none')
            .map((el) => ({id: el.id, height: Math.round(el.getBoundingClientRect().height)})));

        expect(chips.length, 'several chips should be showing').toBeGreaterThanOrEqual(4);
        const heights = new Set(chips.map((chip) => chip.height));
        expect(heights.size, `chips differ in height: ${JSON.stringify(chips)}`).toBe(1);
    });

    test('the expander unfolds both rails and folds them back', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.state', BUSY_STATE);
        await expect(page.locator('.char-state-bar--mini')).toHaveCount(11);
        const collapsed = await footerHeight(page);

        const expander = page.locator('#footer-expand');
        await expect(expander, 'the expander belongs to the phone footer').toBeVisible();
        await expander.click();

        await expect(page.locator('body')).toHaveAttribute('data-footer-expanded', '1');
        expect(await footerHeight(page), 'unfolding shows more, so the footer grows').toBeGreaterThan(collapsed);
        const vitals = await railOverflow(page, '#char-state-vitals');
        expect(vitals.scrollWidth, 'unfolded, nothing is left off the side').toBeLessThanOrEqual(vitals.clientWidth);

        await expander.click();
        await expect(page.locator('body')).toHaveAttribute('data-footer-expanded', '0');
        expect(await footerHeight(page), 'folding back restores the dock').toBe(collapsed);
    });

    // Someone who never wants to fold it (or never wants it folded) says so once,
    // and the expander goes away with the choice.
    test('can be pinned open or shut, which takes the expander away', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.state', BUSY_STATE);
        await expect(page.locator('.char-state-bar--mini')).toHaveCount(11);
        const folded = await footerHeight(page);

        const modal = await openFooterSettings(page);
        await modal.locator('#ui-mobile-footer-expand').selectOption('expanded');
        await modal.locator('#ui-settings-save').click();
        await expect(modal).not.toBeVisible();

        await expect(page.locator('#footer-expand'), 'nothing left to press').toBeHidden();
        expect(await footerHeight(page), 'pinned open, the footer shows everything').toBeGreaterThan(folded);
        const vitals = await railOverflow(page, '#char-state-vitals');
        expect(vitals.scrollWidth, 'pinned open, nothing is off the side').toBeLessThanOrEqual(vitals.clientWidth);

        const back = await openFooterSettings(page);
        await back.locator('#ui-mobile-footer-expand').selectOption('collapsed');
        await back.locator('#ui-settings-save').click();
        await expect(back).not.toBeVisible();

        await expect(page.locator('#footer-expand'), 'still nothing to press').toBeHidden();
        expect(await footerHeight(page), 'pinned shut, the dock is back').toBe(folded);
    });

    test('can be switched off, which restores the wide-screen footer', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.state', CALM_STATE);
        await expect(page.locator('.char-state-bar--mini')).toHaveCount(4);

        const modal = await openFooterSettings(page);
        await modal.locator('#ui-mobile-footer-compact').uncheck();
        await modal.locator('#ui-settings-save').click();
        await expect(modal).not.toBeVisible();

        await expect(page.locator('.char-state-bar--mini'), 'no compact meters once switched off').toHaveCount(0);
        await expect(page.locator('#char-state-text'), 'the configured text mode is back').toContainText('HP:');
        await expect(page.locator('#footer-expand')).toBeHidden();
    });
});

test.describe('Footer on a wide screen', () => {
    test.use({viewport: {width: 1280, height: 720}});

    test('is untouched by the phone layout', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.state', CALM_STATE);

        await expect(page.locator('#char-state-text'), 'the text mode still renders').toContainText('HP:');
        await expect(page.locator('.char-state-bar--mini'), 'no compact meters on a desktop').toHaveCount(0);
        await expect(page.locator('#footer-expand'), 'nothing to unfold').toBeHidden();

        // The rails are grouping elements only here: a chip is still a direct
        // flex item of the footer row, which is what its configured order acts on.
        const display = await page.evaluate(() => getComputedStyle(document.getElementById('footer-chips')!).display);
        expect(display).toBe('contents');
    });
});

/**
 * The bind pills lead with "[ALT+1]", which is worth its width to a player who
 * can press it and clutter to one who cannot. The hints follow a guess at
 * whether a keyboard is attached (@shared/dom/hardwareKeyboard), which on a
 * touch-only device starts at "no" and is revised by the first keystroke no
 * on-screen keyboard could have sent.
 */
test.describe('Bind shortcut hints without a keyboard', () => {
    test.use({viewport: PHONE, hasTouch: true, isMobile: true});

    /**
     * Opens the client the way a finger would. `waitForCommandInput` dismisses
     * the login overlay with Escape, which is itself proof of a keyboard - on a
     * phone that panel is closed by tapping its cross.
     */
    async function openByTouch(page: Page) {
        await page.goto('/');
        const close = page.locator('#auth-close');
        if (await close.isVisible()) await close.click();
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    }

    test('are dropped on a touch-only device and return once a key proves one', async ({page}) => {
        await openByTouch(page);

        await submitCommand(page, '/mbind 1 zerknij');
        const bind = page.locator('#multi-binds .multi-bind').first();
        await expect(bind, 'the bind itself is still there').toContainText('zerknij');
        await expect(bind.locator('.multi-bind-key'), 'with no shortcut to press, no hint').toHaveCount(0);

        // Alt is both how a bind is fired and proof that a keyboard is present.
        await page.keyboard.press('Alt');
        await expect(bind.locator('.multi-bind-key'), 'the hint is worth its width now').toHaveText('[ALT+1]');
    });

    test('can be forced on from the settings', async ({page}) => {
        await openByTouch(page);

        await submitCommand(page, '/mbind 1 zerknij');
        const hint = page.locator('#multi-binds .multi-bind').first().locator('.multi-bind-key');
        await expect(hint).toHaveCount(0);

        await page.click(MENU_BUTTON);
        await page.click(UI_SETTINGS_BUTTON);
        const modal = page.locator(UI_SETTINGS_MODAL);
        await expect(modal).toBeVisible();
        // The bind-row settings live beside "Zawsze pokazuj pasek multibindow"
        // on the tab the modal opens on.
        await modal.locator('#ui-multibind-key-hints').selectOption('always');
        await modal.locator('#ui-settings-save').click();
        await expect(modal).not.toBeVisible();

        await expect(hint).toHaveText('[ALT+1]');
    });
});
