import {expect, test} from './support/fixtures';

test.describe('Kuźnia login', () => {
    test.beforeEach(async ({page}) => {
        await page.addInitScript(() => {
            const raw = localStorage.getItem('uiSettings');
            const settings = raw ? JSON.parse(raw) : {};
            localStorage.setItem('uiSettings', JSON.stringify({...settings, colorTheme: 'forged'}));
        });
        await page.goto('/');
        await expect(page.locator('#auth-overlay')).toBeVisible();
    });

    test('takes the screen: the game hidden, the forge burning, the fields ruled', async ({page}) => {
        await expect(page.locator('#main_text_output_msg_wrapper')).toBeHidden();
        await expect(page.locator('.auth-embers .auth-ember').first()).toBeAttached();
        await expect(page.locator('.auth-hearth')).toBeVisible();
        await expect(page.locator('#login-form .auth-prompt').first()).toBeVisible();
        await expect(page.locator('#login-character')).toHaveCSS('border-top-width', '0px');
    });

    test('the password is masked by the forged dots, one per character, and never spelled', async ({page}) => {
        const password = page.locator('#login-password');
        await password.click();
        await page.keyboard.type('sekret');
        const mask = page.locator('.auth-mask');
        await expect(mask.locator('.auth-glyph')).toHaveCount(6);
        await expect(mask).toHaveText('••••••');
        await expect(password).toHaveCSS('color', 'rgba(0, 0, 0, 0)');

        // Shown with the eye: the input's own ink, no dots over it.
        await page.locator('#login-password-toggle').click();
        await expect(mask).toBeHidden();
        await expect(password).not.toHaveCSS('color', 'rgba(0, 0, 0, 0)');
    });

    test('the connection modes wait folded under Połączenie', async ({page}) => {
        const modes = page.locator('#proxy-controls-root .proxy-seg');
        await expect(modes).toBeHidden();
        await page.locator('#auth-conn-fold').click();
        await expect(modes).toBeVisible();
        await page.locator('#auth-conn-fold').click();
        await expect(modes).toBeHidden();
    });
});
