import path from 'node:path';
import {expect, test} from './support/fixtures';
import {ensureGameSocket, installEmbeddedMock, waitForCommandInput} from './support/mocks';
import {openSettings, SETTINGS_SAVE} from './support/settings';

const VERA_DIR = path.resolve('src/web/fonts/vera-sans-mono');
const OUTPUT = '#main_text_output_msg_wrapper';

test.beforeEach(async ({context}) => {
    await installEmbeddedMock(context);
});

test.describe('Output font from own files or system', () => {
    test('uploaded files fill their slots, render the output and survive a reload', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openSettings(page, 'ui-appearance');
        await modal.locator('#ui-font-family').selectOption('uploaded');
        // Two files picked at once, as from a file dialog.
        await modal.locator('#ui-font-upload-input').setInputFiles([
            path.join(VERA_DIR, 'vera-sans-mono.woff2'),
            path.join(VERA_DIR, 'vera-sans-mono-bold.woff2'),
        ]);

        const slots = modal.locator('#ui-font-slots');
        await expect(slots.locator('[data-slot="regular"]')).toContainText('vera-sans-mono.woff2');
        await expect(slots.locator('[data-slot="bold"]')).toContainText('vera-sans-mono-bold.woff2');
        await expect(slots.locator('[data-slot="italic"]')).toContainText('kursywa nie będzie widoczna');
        await expect(slots.locator('.ui-font-slot--filled')).toHaveCount(2);
        await expect(modal.locator('#ui-uploaded-font-name')).toHaveText('vera sans mono');

        // A missing slot can be filled on its own.
        await slots.locator('[data-slot="italic"] button').click();
        await modal.locator('#ui-font-slot-input').setInputFiles(path.join(VERA_DIR, 'vera-sans-mono-ext.woff2'));
        await expect(slots.locator('[data-slot="italic"]')).toContainText('vera-sans-mono-ext.woff2');
        await slots.locator('[data-slot="italic"] button[title="Usuń plik"]').click();
        await expect(slots.locator('.ui-font-slot--filled')).toHaveCount(2);

        await modal.locator(SETTINGS_SAVE).click();

        const expectFontInUse = async () => {
            await expect(page.locator(OUTPUT)).toHaveCSS('font-family', /"Arkadia Uploaded Font", "vera sans mono", monospace/);
            const loaded = await page.evaluate(async () => {
                await document.fonts.load('700 16px "Arkadia Uploaded Font"');
                return document.fonts.check('700 16px "Arkadia Uploaded Font"')
                    && [...document.fonts].some(f => f.family.includes('Arkadia Uploaded Font') && f.status === 'loaded');
            });
            expect(loaded, 'the uploaded faces load').toBe(true);
        };
        await expectFontInUse();

        await page.reload();
        await waitForCommandInput(page);
        await expectFontInUse();
    });

    test('an installed font is used by name, and a missing one is flagged', async ({page, context}) => {
        await context.grantPermissions(['local-fonts']);
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openSettings(page, 'ui-appearance');
        await modal.locator('#ui-font-family').selectOption('system');
        // Picking the option is enough to get the installed fonts as suggestions.
        await expect.poll(() => modal.locator('#ui-system-font-list option').count()).toBeGreaterThan(0);
        await modal.locator('#ui-system-font-family').fill('Zzz No Such Font');
        await expect(modal.locator('#ui-system-font-settings')).toContainText('Nie znaleziono takiej czcionki');

        // The client's own UI font is present in every browser that runs it.
        await modal.locator('#ui-system-font-family').fill('Radio Canada');
        await expect(modal.locator('#ui-system-font-settings')).not.toContainText('Nie znaleziono');
        await modal.locator('#ui-system-font-family').fill('Zzz No Such Font');
        await modal.locator(SETTINGS_SAVE).click();
        await expect(page.locator(OUTPUT)).toHaveCSS('font-family', '"Zzz No Such Font", monospace');
    });
});
