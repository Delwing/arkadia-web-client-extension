import { expect, test } from './support/fixtures';
import type { Page } from '@playwright/test';
import { ensureGameSocket, pushText } from './support/mocks';

const overlay = (page: Page) => page.locator('#auth-overlay');

/** No helper on this machine, whatever runs on the one running the tests. */
async function noHelper(page: Page) {
    await page.route('http://127.0.0.1:19876/**', (route) => route.abort());
}

test.describe('Logowanie', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('the card: character, password with its eye, connecting without logging in', async ({ page }) => {
        await page.goto('/');
        await expect(overlay(page)).toBeVisible();
        await expect(page.locator('#auth-panel .auth-title')).toHaveText('Wejdź do Arkadii');
        await expect(page.locator('#connect-button')).toContainText('Połącz bez logowania');
        await expect(page.locator('#commit-info .commit-info-link')).not.toBeEmpty();
        await page.screenshot({ path: 'test-results/login-desktop.png' });

        const password = page.locator('#login-password');
        await password.fill('haslohaslo');
        await page.locator('#login-password-toggle').click();
        await expect(password).toHaveAttribute('type', 'text');
        await page.locator('#login-password-toggle').click();
        await expect(password).toHaveAttribute('type', 'password');

        await page.locator('#connect-button').click();
        await ensureGameSocket(page);
        await expect(overlay(page)).toBeHidden();
    });

    test('each mode has its settings; Escape closes them, not the screen', async ({ page }) => {
        await page.goto('/');
        await page.locator('#proxy-mode-proxy').click();
        await expect(page.locator('#proxy-mode-proxy')).toHaveClass(/is-on/);
        await page.locator('#proxy-settings-toggle').click();
        const settings = page.locator('#proxy-settings');
        await expect(settings).toContainText('Ustawienia: Proxy');
        await expect(settings.locator('#proxy-url')).toBeVisible();
        await expect(settings.locator('#mccp-enabled')).toBeChecked();
        await page.screenshot({ path: 'test-results/login-settings.png' });

        await settings.locator('#mccp-enabled').uncheck();
        await page.keyboard.press('Escape');
        await expect(settings).toBeHidden();
        await expect(overlay(page)).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem('mccpEnabled'))).toBe('false');

        await page.locator('#proxy-mode-direct').click();
        await page.locator('#proxy-settings-toggle').click();
        await expect(settings).toContainText('Ustawienia: Bezpośrednio');
        await expect(settings.locator('#proxy-url')).toHaveCount(0);
        await expect(settings.locator('#mccp-enabled')).not.toBeChecked();
    });

    test('the helper mode says when there is no helper, and what to do', async ({ page }) => {
        await noHelper(page);
        await page.goto('/');
        await page.locator('#proxy-mode-helper').click();
        await expect(page.locator('#helper-missing')).toContainText('Pomocnik nie odpowiada.');
        await expect(page.locator('#auth-panel')).toHaveClass(/is-blocked/);
        await page.screenshot({ path: 'test-results/login-helper.png' });

        await page.locator('#helper-missing').getByText('Uruchom pomocnika').click();
        await expect(page.locator('#helper-failed')).toContainText('Nie udało się uruchomić pomocnika.', { timeout: 15000 });
        await expect(page.locator('#helper-failed').getByText('Jak zainstalować')).toBeVisible();

        await page.locator('#proxy-mode-direct').click();
        await expect(page.locator('#helper-failed')).toHaveCount(0);
        await expect(page.locator('#auth-panel')).not.toHaveClass(/is-blocked/);
    });

    test('what the game says about the login shows over the form', async ({ page }) => {
        await page.goto('/');
        await page.locator('#login-password').fill('zle');
        await page.locator('#connect-button').click();
        await ensureGameSocket(page);
        await pushText(page, 'Nieprawidlowe haslo.', { type: 'system.login' });
        await page.evaluate(() => {
            for (const socket of (window as any).__mockSockets ?? []) socket.close?.();
        });

        await expect(overlay(page)).toBeVisible();
        const message = page.locator('#system-login-message');
        await expect(message).toContainText('Nieprawidlowe haslo.');
        await expect(message).toContainText('wiadomość od serwera gry');
        await expect(page.locator('#auth-panel')).toHaveClass(/has-password-error/);
        await expect(page.locator('#login-password')).toHaveValue('');
        await expect(page.locator('#login-password')).toHaveAttribute('placeholder', 'Wpisz ponownie');
        await page.screenshot({ path: 'test-results/login-error.png' });
    });
});

test.describe('Logowanie on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('the whole screen, the connection at the bottom', async ({ page }) => {
        await page.goto('/');
        await expect(overlay(page)).toBeVisible();
        const panel = await page.locator('#login-form').boundingBox();
        const conn = await page.locator('.proxy-controls').boundingBox();
        expect(panel && conn && conn.y > panel.y + panel.height).toBe(true);
        expect(conn!.y + conn!.height).toBeLessThanOrEqual(844);
        await page.screenshot({ path: 'test-results/login-phone.png' });

        await page.locator('#auth-close').click();
        await expect(overlay(page)).toBeHidden();
    });
});
