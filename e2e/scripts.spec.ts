import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {waitForCommandInput} from './support/mocks';

const MENU_BUTTON = '#menu-button';
const SCRIPTS_BUTTON = '#scripts-button';
const SCRIPTS_MODAL = '#scripts-modal';

/** Default registry origin — see REGISTRY_URL in src/shared/marketplace/registryHandoff.ts. */
const REGISTRY = 'https://arkadia-package-repository.vercel.app';

async function openScriptsModal(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(SCRIPTS_BUTTON);
    const modal = page.locator(SCRIPTS_MODAL);
    await expect(modal, 'should show scripts modal').toBeVisible();
    return modal;
}

/** Walk the "Dodaj plugin" chooser to one of its routes. */
async function chooseAddRoute(page: Page, title: string) {
    const modal = page.locator(SCRIPTS_MODAL);
    await modal.getByRole('button', {name: 'Dodaj plugin'}).click();
    await page.locator('.plugin-route', {hasText: title}).click();
}

async function addScriptUrl(page: Page, url: string) {
    await chooseAddRoute(page, 'Z adresu URL');
    const dialog = page.locator('.modal', {hasText: 'Dodaj skrypt z URL'}).last();
    await dialog.getByPlaceholder('URL skryptu').fill(url);
    await dialog.getByRole('button', {name: 'Dodaj', exact: true}).click();
}

test('Pasted plugin code can be opened and edited in the plugin editor', async ({page, context}) => {
    const pluginCode = `export async function init() {
  const marker = 'wklejony-marker';
  return {name: 'Wklejony Test', version: '0.0.1', author: 'QA', description: marker};
}`;

    await page.goto('/');
    await waitForCommandInput(page);

    const scriptsModal = await openScriptsModal(page);
    await chooseAddRoute(page, 'Wklej kod');

    const codeDialog = page.locator('.modal', {hasText: 'Dodaj plugin z kodu'}).last();
    await codeDialog.getByPlaceholder('Moja wtyczka').fill('Wklejony Test');
    await codeDialog.getByPlaceholder('export async function init(api) { ... }').fill(pluginCode);
    await codeDialog.getByRole('button', {name: 'Dodaj plugin'}).click();

    const pastedItem = scriptsModal.locator('.plugin-card', {hasText: 'Wklejony Test'});
    await expect(pastedItem, 'should list the pasted plugin').toBeVisible();
    await expect(pastedItem.locator('.plugin-chip'), 'should mark it as a local plugin').toHaveText('Lokalny');

    const [editorPage] = await Promise.all([
        context.waitForEvent('page'),
        pastedItem.getByTitle('Edytuj w edytorze').click(),
    ]);

    await editorPage.waitForLoadState('domcontentloaded');

    await expect(
        editorPage.locator('#plugin-name'),
        'editor should open the pasted plugin, not report it as missing',
    ).toHaveValue('Wklejony Test', {timeout: 30000});
    await expect(
        editorPage.locator('#editor-container .view-lines'),
        'editor should show the pasted source',
    ).toContainText('wklejony-marker', {timeout: 30000});

    await editorPage.close();
});

test('Scripts tab manages URLs, reflects plugin lifecycle, and cleans up storage', async ({page}) => {
    const primaryUrl = 'https://example.com/plugin.js';
    const secondaryUrl = 'https://example.com/other.js';

    await page.route(`${primaryUrl}**`, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        await route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: `export async function init() { return { name: 'Test Plugin', version: '1.2.3', author: 'QA', description: 'Lifecycle check' }; }`,
        });
    });

    await page.route(`${secondaryUrl}**`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: `export async function init() { throw new Error('Initialization failed'); }`,
        });
    });

    await page.goto('/');
    await waitForCommandInput(page);

    let scriptsModal = await openScriptsModal(page);

    await addScriptUrl(page, primaryUrl);

    await expect(
        scriptsModal.locator('.plugin-card', {hasText: primaryUrl}),
        'should display the script that was added',
    ).toBeVisible();
    await expect(scriptsModal.getByText('Test Plugin'), 'should render loaded plugin name').toBeVisible();
    await expect(scriptsModal.getByText('v1.2.3'), 'should render loaded plugin version badge').toBeVisible();
    await expect(scriptsModal.getByText('Lifecycle check'), 'should render plugin description').toBeVisible();

    await addScriptUrl(page, secondaryUrl);

    await expect(
        scriptsModal.locator('.plugin-card', {hasText: secondaryUrl}),
        'should display the second script',
    ).toBeVisible();

    await page.waitForFunction(([first, second]) => {
        const stored = localStorage.getItem('scripts');
        if (!stored) return false;
        try {
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) && parsed.includes(first) && parsed.includes(second);
        } catch {
            return false;
        }
    }, [primaryUrl, secondaryUrl]);

    await page.reload();
    await waitForCommandInput(page);
    scriptsModal = await openScriptsModal(page);

    const primaryItem = scriptsModal.locator('.plugin-card', {hasText: primaryUrl});
    const secondaryItem = scriptsModal.locator('.plugin-card', {hasText: secondaryUrl});

    await expect(primaryItem, 'should persist primary script after reload').toBeVisible();
    await expect(secondaryItem, 'should persist secondary script after reload').toBeVisible();
    await expect(primaryItem.getByText('Test Plugin'), 'should render loaded plugin name').toBeVisible();
    await expect(primaryItem.getByText('v1.2.3'), 'should render loaded plugin version badge').toBeVisible();
    await expect(primaryItem.getByText('Lifecycle check'), 'should render plugin description').toBeVisible();

    await expect(
        secondaryItem.getByText('Init failed: Initialization failed'),
        'should show plugin error message for failed init',
    ).toBeVisible();
    await expect(secondaryItem.locator('.spinner-border'), 'should hide spinner on error').toHaveCount(0);

    // The "Problemy" filter is the fast way to the one script that broke.
    await scriptsModal.locator('.plugin-filter', {hasText: 'Problemy'}).click();
    await expect(scriptsModal.locator('.plugin-card'), 'should isolate the failing script').toHaveCount(1);
    await scriptsModal.locator('.plugin-filter', {hasText: 'Wszystkie'}).click();

    await primaryItem.getByTitle('Usun').click();
    await expect(primaryItem, 'should remove primary script entry').toHaveCount(0);

    await secondaryItem.getByTitle('Usun').click();
    await expect(secondaryItem, 'should remove secondary script entry').toHaveCount(0);
    await expect(scriptsModal.locator('.plugin-card'), 'should clear scripts list after removals').toHaveCount(0);

    await page.waitForFunction(() => {
        const stored = localStorage.getItem('scripts');
        if (!stored) return false;
        try {
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) && parsed.length === 0;
        } catch {
            return false;
        }
    });
});

test('Catalogue tab installs a plugin and then offers its update', async ({page}) => {
    let latestVersion = '1.0.0';
    const bundle = (version: string) =>
        `export async function init() { return { name: 'Katalogowy', version: '${version}', author: 'QA', description: 'Z katalogu' }; }`;

    const summary = () => ({
        slug: 'katalogowy',
        displayName: 'Katalogowy',
        description: 'Plugin prosto z katalogu',
        tags: ['walka'],
        latestVersion,
        installs: 42,
        owner: {handle: 'qa', displayName: 'QA'},
        updatedAt: new Date().toISOString(),
        trustedPublisher: true,
    });

    await page.route(`${REGISTRY}/api/v1/plugins**`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
                new URL(route.request().url()).searchParams.has('slugs')
                    ? {items: [summary()]}
                    : {items: [summary()], total: 1, page: 1, perPage: 24},
            ),
        });
    });

    await page.route(`${REGISTRY}/r/katalogowy/*/plugin.js`, async (route) => {
        const version = new URL(route.request().url()).pathname.split('/')[3];
        await route.fulfill({status: 200, contentType: 'application/javascript', body: bundle(version)});
    });

    await page.goto('/');
    await waitForCommandInput(page);

    const scriptsModal = await openScriptsModal(page);
    await scriptsModal.locator('.plugin-tab', {hasText: 'Katalog'}).click();

    const card = scriptsModal.locator('.plugin-card', {hasText: 'Katalogowy'});
    await expect(card, 'should list the catalogue plugin').toBeVisible();
    await expect(card.getByText('42 instalacji'), 'should show the install count').toBeVisible();

    await card.getByRole('button', {name: 'Zainstaluj', exact: true}).click();
    // The chip states it is installed; the button is then free to offer removal.
    await expect(card.locator('.plugin-chip--installed'), 'should mark it installed').toBeVisible();
    await expect(
        card.getByRole('button', {name: 'Odinstaluj'}),
        'should offer removal straight from the catalogue',
    ).toBeVisible();

    await scriptsModal.locator('.plugin-tab', {hasText: 'Zainstalowane'}).click();

    const installed = scriptsModal.locator('.plugin-card', {hasText: 'Katalogowy'});
    await expect(installed, 'should appear on the installed tab').toBeVisible();
    await expect(installed.locator('.plugin-chip'), 'should be tagged as a catalogue install').toHaveText('Katalog');
    await expect(installed.getByText('v1.0.0'), 'should run the version it pinned').toBeVisible();

    await page.waitForFunction((url) => {
        const stored = localStorage.getItem('scripts');
        return Boolean(stored && JSON.parse(stored).includes(url));
    }, `${REGISTRY}/r/katalogowy/1.0.0/plugin.js`);

    // A newer release shows up in the catalogue: the panel offers it, and taking
    // it replaces the pinned URL rather than adding a second copy.
    latestVersion = '1.1.0';
    await page.reload();
    await waitForCommandInput(page);
    await openScriptsModal(page);

    const updated = page.locator(SCRIPTS_MODAL).locator('.plugin-card', {hasText: 'Katalogowy'});
    await expect(updated.getByText('Dostepna wersja'), 'should offer the newer release').toBeVisible();
    await updated.getByRole('button', {name: 'Aktualizuj', exact: true}).click();

    await expect(updated.getByText('v1.1.0'), 'should run the new version').toBeVisible();
    await page.waitForFunction((url) => {
        const stored = localStorage.getItem('scripts');
        const parsed = stored ? JSON.parse(stored) : [];
        return parsed.length === 1 && parsed[0] === url;
    }, `${REGISTRY}/r/katalogowy/1.1.0/plugin.js`);

    // Uninstalling from the catalogue tab drops it whichever version is pinned.
    const modal = page.locator(SCRIPTS_MODAL);
    await modal.locator('.plugin-tab', {hasText: 'Katalog'}).click();
    await modal
        .locator('.plugin-card', {hasText: 'Katalogowy'})
        .getByRole('button', {name: 'Odinstaluj'})
        .click();

    await expect(
        modal.locator('.plugin-card', {hasText: 'Katalogowy'}).getByRole('button', {name: 'Zainstaluj', exact: true}),
        'should offer installing again',
    ).toBeVisible();
    await page.waitForFunction(() => {
        const stored = localStorage.getItem('scripts');
        return Boolean(stored) && JSON.parse(stored!).length === 0;
    });
});
