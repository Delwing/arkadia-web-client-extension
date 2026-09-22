import { expect, test } from './support/fixtures';
import type { Page } from '@playwright/test';
import { ensureGameSocket, waitForCommandInput } from './support/mocks';

const docsWindow = (page: Page) => page.locator('.docs-window');

async function openDocs(page: Page) {
    await page.goto('/');
    await ensureGameSocket(page);
    await waitForCommandInput(page);
    await page.click('#menu-button');
    await page.locator('.command-menu__panel #docs-button').click();
    await expect(docsWindow(page)).toBeVisible();
}

test.describe('Dokumentacja', () => {
    test.use({ viewport: { width: 1280, height: 860 } });

    test('pages on the left, sections of the open one under it, commands with Wstaw', async ({ page }) => {
        await openDocs(page);
        const win = docsWindow(page);
        await expect(win.locator('.doc-head h1')).toHaveText('Przegląd');
        await expect(win.locator('.doc-cap')).toHaveText(['Start', 'Gra', 'Klient']);

        await win.locator('.doc-nav__page', { hasText: 'Walka' }).click();
        await expect(win.locator('.doc-crumb')).toHaveText('Gra / Walka');
        await expect(win.locator('.doc-lead')).toContainText('Komendy do walki');
        const sub = win.locator('.doc-nav__sub button');
        await expect(sub.first()).toHaveText('Tryb ataku');
        await expect(sub.first()).toHaveClass(/is-active/);

        // A section from the contents scrolls there and lights up.
        await sub.filter({ hasText: 'Zaslanianie' }).click();
        await expect(sub.filter({ hasText: 'Zaslanianie' })).toHaveClass(/is-active/);

        // Wstaw puts the command on the command line, ready for its argument.
        const row = win.locator('.doc-cmd', { has: page.locator('.doc-token', { hasText: /^\/zz cel$/ }) });
        await row.hover();
        await row.locator('.doc-insert').click();
        await expect(page.locator('#message-input')).toHaveValue('/zz ');
        await expect(page.locator('#message-input')).toBeFocused();
        await page.screenshot({ path: 'test-results/docs-page.png' });
    });

    test('search lists hits by page, marked, and opens the page at the section', async ({ page }) => {
        await openDocs(page);
        const win = docsWindow(page);
        await win.locator('#docs-search').fill('zasłon');
        await expect(win.locator('.doc-results__head h1')).toContainText('dla „zasłon”');
        await expect(win.locator('.doc-cap')).toHaveText(['Wyniki na stronach']);
        await expect(win.locator('.doc-nav__page', { hasText: 'Walka' }).locator('.doc-count')).not.toHaveText('0');
        await expect(win.locator('.doc-results mark').first()).toBeVisible();
        await page.screenshot({ path: 'test-results/docs-search.png' });

        const group = win.locator('.doc-hits', { has: page.locator('.doc-hits__head', { hasText: 'Zaslanianie' }) }).first();
        await group.locator('.doc-link').click();
        await expect(win.locator('#docs-search')).toHaveValue('');
        await expect(win.locator('.doc-crumb')).toHaveText('Gra / Walka');
        await expect(win.locator('.doc-nav__sub button', { hasText: 'Zaslanianie' })).toHaveClass(/is-active/);

        // "/" jumps to the search box from anywhere in the window.
        await win.locator('.doc-head h1').click();
        await page.keyboard.press('/');
        await expect(win.locator('#docs-search')).toBeFocused();
    });

    test('the assistant (/pomoc) is a click away, and offered when nothing matches', async ({ page }) => {
        await openDocs(page);
        const win = docsWindow(page);
        await win.locator('#docs-search').fill('qwxz');
        await expect(win.locator('.doc-empty .doc-ask')).toBeVisible();
        await expect(win.locator('#docs-ask')).toHaveText('Zapytaj asystenta o to');
        await win.locator('#docs-search').fill('');
        await win.locator('#docs-ask').click();
        await expect(page.locator('.assistant-popup')).toBeVisible();
    });

    test('Lista obiektów keeps its demos', async ({ page }) => {
        await openDocs(page);
        const win = docsWindow(page);
        await win.locator('.doc-nav__page', { hasText: 'Lista obiektów' }).click();
        await expect(win.locator('.doc-custom .js-demo-list')).not.toBeEmpty();
        await expect(win.locator('.doc-nav__sub button').first()).toHaveText('Scenariusz uzyty w przykladach');
    });
});

test.describe('Dokumentacja on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('contents behind a button, sections as chips, commands as cards', async ({ page }) => {
        await openDocs(page);
        const win = docsWindow(page);
        await expect(win.locator('.doc--narrow')).toBeVisible();
        await win.locator('#docs-toc').click();
        await win.locator('.doc-nav__page', { hasText: 'Walka' }).click();
        await expect(win.locator('.doc-bar__title')).toHaveText('Walka');
        await expect(win.locator('.doc-chip').first()).toHaveText('Tryb ataku');
        await expect(win.locator('.doc-insert').first()).toBeVisible();
        await page.screenshot({ path: 'test-results/docs-phone.png' });

        await win.locator('#docs-search-toggle').click();
        await win.locator('#docs-search').fill('kolejk');
        await expect(win.locator('.doc-hits').first()).toBeVisible();
    });
});
