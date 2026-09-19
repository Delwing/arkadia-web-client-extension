import {test, expect} from './support/fixtures';
import {ensureGameSocket, primeCharInfo, waitForCommandInput} from './support/mocks';
import {goToSettingsPage, openSettings, type SettingsCategory} from './support/settings';

/**
 * The settings dialog's unsaved-changes dot, across the migrated pages.
 *
 * This exists because the failure mode is silent. `settingsDirty.ts` compares
 * the *rendered* page, and @design's Checkbox is a <button role="checkbox">
 * with no `.checked` property -- a page whose controls stop feeding that
 * comparison still saves correctly and no test fails, the dot just quietly
 * stops appearing (UI_MIGRATION.md section 4). One control per page is enough:
 * what is being checked is that the page is wired to the tracker at all.
 *
 * Toggling back is the other half of the contract -- the dot is "differs from
 * what the page showed when it was opened", not "was touched".
 */
const CASES: [SettingsCategory, string][] = [
    ['character-general', '#compassBackExits'],
    ['character-items', '#containerOpen'],
    ['character-combat', '#enemyBindsKeepUnchanged'],
    ['ui-footer', '#ui-emoji-labels'],
    ['ui-radial', '#mobile-radial-enabled'],
    ['ui-mobile-buttons', '#ui-haptic-feedback'],
    ['ui-buttons', '#desktop-buttons-lock'],
];

test('unsaved-changes dot follows a control on every migrated page', async ({page}) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page, {name: 'DirtyHero'});
    await page.waitForFunction(() => localStorage.getItem('currentCharacter') === 'DirtyHero');

    const modal = await openSettings(page, 'character-general');
    for (const [category, control] of CASES) {
        await goToSettingsPage(page, category);
        const nav = modal.locator(`.settings-dialog__nav-item[data-settings-category="${category}"]`);
        await expect(nav.locator('.settings-dialog__dirty'), `${category} starts clean`).toHaveCount(0);
        await modal.locator(control).click();
        await expect(nav.locator('.settings-dialog__dirty'), `${category} should go dirty`).toHaveCount(1);
        // ...and back again, which is the other half of the contract.
        await modal.locator(control).click();
        await expect(nav.locator('.settings-dialog__dirty'), `${category} should go clean again`).toHaveCount(0);
    }
});
