import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, pushGmcp, submitCommand, waitForCommandInput} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';

/**
 * The phone footer (src/web/mobileFooter.ts + footerMobile.css).
 *
 * What is being pinned here is that the footer stops resizing itself. Its
 * contents are dynamic - the player picks which chips exist, and how many stats
 * show depends on the character's condition - so folded it is one line of fixed
 * height, and only the expander (wrapping the rows to show everything) changes its height.
 */

const PHONE = {width: 390, height: 844};

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

/** What unfolding must leave alone: a chip's height and each vital's size. */
async function footerSizes(page: Page) {
    return page.evaluate(() => ({
        chip: Math.round(document.querySelector('#footer-chips .chip')?.getBoundingClientRect().height ?? -1),
        vitals: Array.from(document.querySelectorAll('#char-state-vitals .vital'), (el) => {
            const box = el.getBoundingClientRect();
            return `${Math.round(box.width)}x${Math.round(box.height)}`;
        }),
    }));
}

/** On a phone the dialog swaps its sidebar for a page select, which the helper uses. */
async function openFooterSettings(page: Page) {
    return openSettings(page, 'ui-footer');
}

test.describe('Mobile footer', () => {
    test.use({viewport: PHONE});

    /** Vitals rendered visible (folded ones may sit past the row's scroll edge). */
    const shownVitals = (page: Page) => page.locator('#char-state-vitals .vital:visible');

    test('folded, it is two rows: every vital, then the chips, each scrolling sideways', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.state', CALM_STATE);

        await expect(page.locator('#char-state-vitals .vital'), 'every stat worth showing is there').toHaveCount(4);
        await expect(shownVitals(page), 'folded, every vital is still there').toHaveCount(4);
        await expect(shownVitals(page).first()).toHaveAttribute('data-vital', 'hp');
        await expect(page.locator('#char-state-vitals .vital[data-vital="hp"] .vital__pip.is-on')).toHaveCount(6);

        const vitals = await page.locator('#char-state-vitals').boundingBox();
        const chips = await page.locator('#footer-chips').boundingBox();
        expect(chips!.y, 'the chips have a row of their own, under the vitals').toBeGreaterThanOrEqual(vitals!.y + vitals!.height);
        await expect(page.locator('#char-state-vitals')).toHaveCSS('overflow-x', 'auto');
        await expect(page.locator('#footer-chips')).toHaveCSS('overflow-x', 'auto');
    });

    test('keeps one height while stats and chips come and go', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.state', CALM_STATE);
        await expect(page.locator('#char-state-vitals .vital')).toHaveCount(4);
        const quiet = await footerHeight(page);

        // Everything the game can throw at the footer at once.
        await pushGmcp(page, 'char.state', BUSY_STATE);
        await pushGmcp(page, 'mail.state', {unreceived: true, unsent: true});
        await expect(page.locator('#char-state-vitals .vital')).toHaveCount(11);
        await expect(page.locator('#mail-status .chip')).toBeVisible();

        expect(await footerHeight(page), 'footer height must not move with its contents').toBe(quiet);
    });

    // Chips of different heights in one row read as a mistake.
    test('gives every chip in the line the same height', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.state', CALM_STATE);
        await pushGmcp(page, 'mail.state', {unreceived: true, unsent: true});
        await page.locator('#footer-expand').click();
        await expect(page.locator('#mail-status .chip')).toBeVisible();

        const chips = await page.evaluate(() => Array.from(document.querySelectorAll('#footer-chips .chip'))
            .filter((el) => (el as HTMLElement).offsetWidth > 0)
            .map((el) => ({text: el.textContent, height: Math.round(el.getBoundingClientRect().height)})));

        expect(chips.length, 'several chips should be showing').toBeGreaterThanOrEqual(3);
        const heights = new Set(chips.map((chip) => chip.height));
        expect(heights.size, `chips differ in height: ${JSON.stringify(chips)}`).toBe(1);
    });

    test('the expander unfolds the rows (wrapped, same sizes) and folds them back', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.state', BUSY_STATE);
        await expect(page.locator('#char-state-vitals .vital')).toHaveCount(11);
        const collapsed = await footerHeight(page);
        const sizes = await footerSizes(page);

        const expander = page.locator('#footer-expand');
        await expect(expander, 'the expander belongs to the phone footer').toBeVisible();
        await expander.click();

        await expect(page.locator('body')).toHaveAttribute('data-footer-expanded', '1');
        expect(await footerHeight(page), 'unfolding shows more, so the footer grows').toBeGreaterThan(collapsed);
        await expect(shownVitals(page), 'unfolded, every vital is shown').toHaveCount(11);
        expect(await footerSizes(page), 'unfolding only wraps the rows; chips and bars keep their size').toEqual(sizes);

        await expander.click();
        await expect(page.locator('body')).toHaveAttribute('data-footer-expanded', '0');
        expect(await footerHeight(page), 'folding back restores the line').toBe(collapsed);
        await expect(shownVitals(page)).toHaveCount(11);
    });

    // Someone who never wants to fold it (or never wants it folded) says so once,
    // and the expander goes away with the choice.
    test('can be pinned open or shut, which takes the expander away', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.state', BUSY_STATE);
        await expect(page.locator('#char-state-vitals .vital')).toHaveCount(11);
        const folded = await footerHeight(page);

        const modal = await openFooterSettings(page);
        await modal.locator('#ui-mobile-footer-expand').selectOption('expanded');
        await saveSettings(page);

        await expect(page.locator('#footer-expand'), 'nothing left to press').toBeHidden();
        expect(await footerHeight(page), 'pinned open, the footer shows everything').toBeGreaterThan(folded);
        await expect(shownVitals(page)).toHaveCount(11);

        const back = await openFooterSettings(page);
        await back.locator('#ui-mobile-footer-expand').selectOption('collapsed');
        await saveSettings(page);

        await expect(page.locator('#footer-expand'), 'still nothing to press').toBeHidden();
        expect(await footerHeight(page), 'pinned shut, the line is back').toBe(folded);
    });

    test('expanded on a narrow phone, chips that wrap stay visible', async ({page}) => {
        await page.setViewportSize({width: 300, height: 700});
        await page.goto('/');
        await waitForCommandInput(page);
        await page.locator('#footer-expand').click();
        await expect(page.locator('body')).toHaveAttribute('data-footer-expanded', '1');

        const slots = page.locator('#footer-chips .status-slot');
        const tops = await slots.evaluateAll((els) => els.map((el) => (el as HTMLElement).offsetTop));
        expect(new Set(tops).size, 'the chips wrap at this width').toBeGreaterThan(1);
        const hidden = await slots.evaluateAll((els) => els.filter((el) => getComputedStyle(el).visibility === 'hidden').length);
        expect(hidden, 'no wrapped chip is left invisible').toBe(0);
    });

    test('can be switched off, which restores the wide-screen line', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.state', CALM_STATE);
        await expect(page.locator('#footer-chips')).toHaveCSS('overflow-x', 'auto');

        const modal = await openFooterSettings(page);
        await modal.locator('#ui-mobile-footer-compact').uncheck();
        await saveSettings(page);

        await expect(shownVitals(page), 'every vital back on the line').toHaveCount(4);
        await expect(page.locator('#footer-chips'), 'no longer a scrolling row of its own').not.toHaveCSS('overflow-x', 'auto');
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

        await expect(page.locator('#char-state-vitals .vital:visible'), 'every vital on the line').toHaveCount(4);
        await expect(page.locator('#footer-expand'), 'nothing to unfold').toBeHidden();
    });
});

/**
 * The bind pills lead with "ALT+1", which is worth its width to a player who
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
        await expect(bind.locator('.multi-bind-key'), 'the hint is worth its width now').toHaveText('ALT+1');
    });

    test('can be forced on from the settings', async ({page}) => {
        await openByTouch(page);

        await submitCommand(page, '/mbind 1 zerknij');
        const hint = page.locator('#multi-binds .multi-bind').first().locator('.multi-bind-key');
        await expect(hint).toHaveCount(0);

        // The bind-row settings live beside "Zawsze pokazuj pasek multibindow"
        // on the Komendy page.
        const modal = await openSettings(page, 'ui-commands');
        await modal.locator('#ui-multibind-key-hints').selectOption('always');
        await saveSettings(page);

        await expect(hint).toHaveText('ALT+1');
    });
});
