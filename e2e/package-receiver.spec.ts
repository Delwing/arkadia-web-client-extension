import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput} from './support/mocks';

const NPCS = [
    {name: 'Borgaf Kriegmann', loc: 4},
    {name: 'Gerwazy Kowal', loc: 3},
    {name: 'Otto Gruby', loc: 7},
];

test.describe('Odbiorcy paczek', () => {
    test.beforeEach(async ({page}) => {
        await page.route('**/arkadia-mapa/data/npc.json', route => route.fulfill({json: NPCS}));
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await page.click('#menu-button');
        await page.click('#npc-button');
    });

    test('names each receiver room from the map', async ({page}) => {
        const row = page.locator('.package-receiver__npc-item', {hasText: 'Otto Gruby'});
        await expect(row.locator('.package-receiver__place')).toContainText('Podziemna Sala');
        await expect(row.locator('.package-receiver__place')).toContainText('Zapomniane Jaskinie');
        await expect(row.locator('.package-receiver__place')).toContainText('#7');
    });

    test('the map button previews the receiver room', async ({page}) => {
        const row = page.locator('.package-receiver__npc-item', {hasText: 'Otto Gruby'});
        await row.getByTitle('Podgląd na mapie').click();
        await expect(page.locator('.static-map-popup')).toBeVisible();
    });

    test('search matches the area as well as the name', async ({page}) => {
        await page.fill('.package-receiver input', 'jaskin');
        await expect(page.locator('.package-receiver__npc-item')).toHaveCount(1);
        await expect(page.locator('.package-receiver__npc-item')).toContainText('Otto Gruby');
        await expect(page.locator('.floating-panel.package-receiver')).toContainText('Odbiorcy paczek (1/3)');
    });

    test('shows the package being carried and marks its receiver', async ({page}) => {
        await expect(page.locator('.package-receiver__current')).toHaveCount(0);
        await pushText(page, 'Wypisano na niej duzymi literami: GERWAZY KOWAL.');
        const current = page.locator('.package-receiver__current');
        await expect(current).toContainText('Gerwazy Kowal');
        await expect(current).toContainText('Kamienny Most');
        await expect(page.locator('.package-receiver__npc-item.is-current')).toContainText('Gerwazy Kowal');
    });

    test('Wyczyść asks for a second click', async ({page}) => {
        const clear = page.locator('.floating-panel.package-receiver').getByRole('button', {name: 'Wyczyść', exact: true});
        await clear.click();
        await expect(page.locator('.floating-panel.package-receiver').getByRole('button', {name: 'Na pewno?'})).toBeVisible();
        await expect(page.locator('.package-receiver__npc-item')).toHaveCount(3);
    });
});
