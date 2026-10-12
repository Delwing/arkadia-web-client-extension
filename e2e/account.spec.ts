import { expect, test } from './support/fixtures';
import type { Page } from '@playwright/test';
import { pushGmcp } from './support/mocks';

/*
Konto: logging in by e-mail, creating an account and a character over GMCP,
as the native endpoint takes them. The mock socket stands in for the game:
these tests read the GMCP requests the client sends and push the answers.
*/

const overlay = (page: Page) => page.locator('#auth-overlay');

/** Text as the game sends it inside GMCP: its UTF-8 bytes, one char each. */
const gameBytes = (text: string) => String.fromCharCode(...Buffer.from(text, 'utf8'));

/** Waits for the socket, then says client.connect as the game does once it listens. */
async function gameListens(page: Page) {
    await page.waitForFunction(() => ((window as any).__mockSockets ?? [])
        .some((s: any) => typeof s?.url === 'string' && s.url.includes('arkadia.rpg.pl') && s.readyState === 1));
    await pushGmcp(page, 'client.connect', {});
}

/** Every GMCP request on `path` the client sent so far, payloads parsed. */
async function sentGmcp(page: Page, path: string): Promise<unknown[]> {
    return page.evaluate((wanted) => {
        const found: unknown[] = [];
        for (const socket of (window as any).__mockSockets ?? []) {
            for (const frame of socket?.sent ?? []) {
                let bytes = '';
                try { bytes = atob(frame); } catch { continue; }
                if (!bytes.startsWith('\xff\xfa\xc9')) continue;
                const body = bytes.slice(3, bytes.lastIndexOf('\xff\xf0'));
                const space = body.indexOf(' ');
                const name = space === -1 ? body : body.slice(0, space);
                if (name !== wanted) continue;
                const json = space === -1 ? '' : body.slice(space + 1);
                found.push(json ? JSON.parse(json) : null);
            }
        }
        return found;
    }, path);
}

async function expectSent(page: Page, path: string, payload: unknown) {
    await expect.poll(() => sentGmcp(page, path)).toContainEqual(payload);
}

const OPTIONS = {
    races: [{ val: 0, text: gameBytes('człowiek') }, { val: 1, text: 'elf' }],
    genders: [{ val: 0, text: gameBytes('mężczyzna') }, { val: 1, text: 'kobieta' }],
    startlocs: [{ val: 0, text: 'novigrad' }, { val: 1, text: 'nuln' }],
    attributes: [
        { val: 'wysoki', text: 'wysoki', bit: 0b1111, group: 'wzrost' },
        { val: 'niski', text: 'niski', bit: 0b1111, group: 'wzrost' },
        { val: gameBytes('smukły'), text: gameBytes('smukły'), bit: 0b1100, group: 'budowa' },
        { val: 'brodaty', text: 'brodaty', bit: 0b0001, group: 'twarz' },
    ],
};

async function logIntoAccount(page: Page) {
    await page.goto('/');
    await page.locator('#login-character').fill('gracz@example.com');
    await page.locator('#login-password').fill('haslo');
    await page.locator('#login-submit').click();
    await gameListens(page);
    await expectSent(page, 'account.login', { email: 'gracz@example.com', password: 'haslo' });
    await pushGmcp(page, 'account.login', { email: 'gracz@example.com', status: 'success' });
    await expect(page.locator('#account-screen')).toBeVisible();
    await expectSent(page, 'account.info', null);
    await expectSent(page, 'account.options', null);
}

test.describe('Konto', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('an e-mail logs into the account, and a character from it into the game', async ({ page }) => {
        await logIntoAccount(page);
        await expect(page.locator('#login-form')).toBeHidden();
        await expect(page.locator('#auth-close')).toBeHidden();

        await pushGmcp(page, 'account.info', {
            email: 'gracz@example.com',
            creation_time: 1_600_000_000,
            login_time: 1_700_000_000,
            login_from: 'example.net',
            chars: [{ name: 'dargoth' }, { name: 'xen', blocked: true }],
        });
        const rows = page.locator('.account-char');
        await expect(rows).toHaveCount(2);
        await expect(rows.nth(0)).toContainText('Dargoth');
        await expect(rows.nth(1)).toContainText('zablokowana');
        await expect(rows.nth(1).getByRole('button', { name: 'Graj' })).toBeDisabled();
        await page.screenshot({ path: 'test-results/account-chars.png' });

        await rows.nth(1).getByRole('button', { name: 'Odblokuj' }).click();
        await expectSent(page, 'char.unblock', { name: 'xen' });
        await pushGmcp(page, 'char.unblock', { name: 'xen', status: 'success' });
        await expect(page.locator('#account-chars')).toContainText('Postać Xen została odblokowana.');
        await expect(rows.nth(1).getByRole('button', { name: 'Graj' })).toBeEnabled();

        await rows.nth(0).getByRole('button', { name: 'Graj' }).click();
        await expectSent(page, 'char.login', { name: 'dargoth' });
        await pushGmcp(page, 'char.login', { name: 'dargoth', status: 'success' });
        await expect(overlay(page)).toBeHidden();
    });

    test("a refused e-mail login shows the game's words over the form", async ({ page }) => {
        await page.goto('/');
        await page.locator('#login-character').fill('nikt@example.com');
        await page.locator('#login-password').fill('zle');
        await page.locator('#login-submit').click();
        await gameListens(page);
        await pushGmcp(page, 'account.login', {
            status: 'fail',
            code: 14,
            msg: gameBytes('Żadne konto nie jest przypisane do tego adresu email.'),
        });
        await expect(overlay(page)).toBeVisible();
        await expect(page.locator('#login-form')).toBeVisible();
        await expect(page.locator('#system-login-message')).toContainText('Żadne konto nie jest przypisane do tego adresu email.');
    });

    test('a new account, then a new character in it', async ({ page }) => {
        await page.goto('/');
        await page.locator('#create-account-link').click();
        const form = page.locator('#account-create-account');
        await expect(form).toBeVisible();
        await expect(page.locator('#login-form')).toBeHidden();

        await form.getByRole('button', { name: 'Załóż konto' }).click();
        await expect(form).toContainText('Musisz podać adres e-mail');
        await page.locator('#account-create-email').fill('nowy@example.com');
        await form.getByRole('button', { name: 'Załóż konto' }).click();
        await expect(page.locator('#account-confirm')).toContainText('nowy@example.com');
        await page.locator('#account-confirm-yes').click();
        await gameListens(page);
        await expectSent(page, 'account.create', { email: 'nowy@example.com' });

        await pushGmcp(page, 'account.create', { email: 'nowy@example.com', status: 'success' });
        await expect(page.locator('#account-screen')).toContainText('otrzymasz e-mail z hasłem');
        await pushGmcp(page, 'account.options', OPTIONS);
        await pushGmcp(page, 'account.info', { email: 'nowy@example.com', chars: [], new_player: true });

        const create = page.locator('#account-create-char');
        await expect(create).toBeVisible();
        await expect(page.locator('#account-race option')).toHaveText(['Człowiek', 'Elf']);
        await page.locator('#account-race').selectOption({ label: 'Elf' });
        await create.getByText('Kobieta').click();
        // An elf woman may be tall, short or slender, never bearded.
        await expect(page.locator('#account-adjective-1 option')).not.toContainText(['Brodata']);
        await page.locator('#account-adjective-1').selectOption('wysoki');
        await page.locator('#account-adjective-2').selectOption('smukły');

        await page.locator('#account-random-name').click();
        await expect(page.locator('#account-name')).not.toHaveValue('');
        await page.locator('#account-name').fill('Ilua');
        await expectSent(page, 'account.check_name', { name: 'Ilua' });
        const below = page.locator('#account-decl-genitive');
        const before = (await below.boundingBox())!.y;
        await pushGmcp(page, 'account.check_name', { status: 'fail', msg: gameBytes('Postać o takim imieniu już istnieje.') });
        await expect(page.locator('#account-name-error')).toHaveText('Postać o takim imieniu już istnieje.');
        await expect(page.locator('#account-name')).toHaveClass(/is-invalid/);
        // The objection takes the hint's line: nothing under the name moves.
        expect((await below.boundingBox())!.y).toBe(before);
        await page.locator('#account-name').scrollIntoViewIfNeeded();
        await page.locator('#account-create-char').screenshot({ path: 'test-results/account-name-taken.png' });
        await page.locator('#account-name').fill('Iluana');
        await expect(page.locator('#account-name-error')).toHaveCount(0);

        await page.locator('#account-create-submit').click();
        await expect(create).toContainText('Musisz podać poprawną odmianę imienia.');
        for (const [key, form] of [['genitive', 'Iluany'], ['dative', 'Iluanie'], ['accusative', 'Iluane'], ['instrumental', 'Iluana'], ['locative', 'Iluanie']]) {
            await page.locator(`#account-decl-${key}`).fill(form);
        }
        await page.locator('#account-startloc').selectOption({ label: 'Nuln' });
        await page.locator('#account-create-submit').click();
        await expect(page.locator('#account-confirm')).toContainText('wysoką smukłą elfką, znaną jako Iluana');
        await expect(page.locator('#account-confirm')).toContainText('w Nuln');
        await page.screenshot({ path: 'test-results/account-create-char.png', fullPage: true });

        await page.locator('#account-confirm-yes').click();
        await expectSent(page, 'char.create', {
            name_declension: ['Iluana', 'Iluany', 'Iluanie', 'Iluane', 'Iluana', 'Iluanie'],
            race: 1,
            gender: 1,
            // The UTF-8 bytes of "smukły", one per char, as the game reads them.
            adjectives: ['wysoki', gameBytes('smukły')],
            startloc: 1,
        });
        await pushGmcp(page, 'char.create', { status: 'fail', msg: 'Imie jest zarezerwowane.' });
        await expect(create).toContainText('Imie jest zarezerwowane.');
        await pushGmcp(page, 'char.create', { status: 'success' });
        await expect(overlay(page)).toBeHidden();
    });

    test("the account's settings: details, password, blocking", async ({ page }) => {
        await logIntoAccount(page);
        await pushGmcp(page, 'account.info', { email: 'gracz@example.com', creation_time: 1_600_000_000, chars: [{ name: 'dargoth' }] });
        await page.locator('#account-screen').getByText('Konto', { exact: true }).last().click();
        const settings = page.locator('#account-settings');
        await expect(settings).toContainText('Data założenia');

        await page.locator('#account-password-old').fill('stare');
        await page.locator('#account-password-new').fill('nowe1');
        await page.locator('#account-password-repeat').fill('nowe2');
        await page.locator('#account-change-password').getByRole('button', { name: 'Zmień hasło' }).click();
        await expect(page.locator('#account-change-password')).toContainText('Musisz podać to samo nowe hasło w obu polach.');
        await page.locator('#account-password-repeat').fill('nowe1');
        await page.locator('#account-change-password').getByRole('button', { name: 'Zmień hasło' }).click();
        await expectSent(page, 'account.change.password', { old_password: 'stare', new_password: 'nowe1' });
        await pushGmcp(page, 'account.change.password', { status: 'success' });
        await expect(page.locator('#account-change-password')).toContainText('Hasło zostało zmienione.');
        await expect(page.locator('#account-password-old')).toHaveValue('');

        await page.locator('#account-block-until').fill('2030-01-02T03:04');
        await page.locator('#account-block-password').fill('nowe1');
        await page.locator('#account-block').getByRole('button', { name: 'Zablokuj konto' }).click();
        const until = await page.evaluate(() => Math.floor(new Date('2030-01-02T03:04').getTime() / 1000));
        await expectSent(page, 'account.block', { time: until, password: 'nowe1' });
        await pushGmcp(page, 'account.block', { status: 'success' });
        await expect(page.locator('#account-unblock')).toBeVisible();
        await page.screenshot({ path: 'test-results/account-settings.png', fullPage: true });

        await page.locator('#account-logout').click();
        await expect(page.locator('#login-form')).toBeVisible();
        await expect(page.locator('#account-screen')).toHaveCount(0);
    });

    test('Wyloguj leaves the account even when the close event never comes', async ({ page }) => {
        await logIntoAccount(page);
        // The far end acknowledges nothing: close() leaves the socket closing and
        // never reports it closed, as the browser sometimes does with the game.
        await page.evaluate(() => {
            for (const socket of (window as any).__mockSockets ?? []) {
                socket.close = function () { this.readyState = 2; };
            }
        });
        await page.locator('#account-logout').click();
        await expect(overlay(page)).toBeVisible();
        await expect(page.locator('#login-form')).toBeVisible();
        await expect(page.locator('#account-screen')).toHaveCount(0);
        // Still up a moment later: the card must not give way to a game that is not there.
        await page.waitForTimeout(1500);
        await expect(overlay(page)).toBeVisible();
        await expect(page.locator('#auth-panel')).not.toHaveClass(/is-connecting/);
    });

    test('the client introduces itself before anything else on the native endpoint', async ({ page }) => {
        await page.goto('/');
        await page.locator('#login-character').fill('gracz@example.com');
        await page.locator('#login-password').fill('haslo');
        await page.locator('#login-submit').click();
        await gameListens(page);
        await expectSent(page, 'client.source', { params: 'source=dargoth-client' });
        const [hello] = await sentGmcp(page, 'Core.Hello') as Array<{ client: string; version?: string }>;
        expect(hello.client).toBe('Dargoth Client');
        expect(hello.version).toMatch(/^\w+$/);
        // The introduction goes first, the account login after it, as in the original client.
        const order = await page.evaluate(() => {
            const paths: string[] = [];
            for (const socket of (window as any).__mockSockets ?? []) {
                for (const frame of socket?.sent ?? []) {
                    let bytes = '';
                    try { bytes = atob(frame); } catch { continue; }
                    if (bytes.startsWith('\xff\xfa\xc9')) paths.push(bytes.slice(3).split(' ')[0]);
                }
            }
            return paths.filter((p) => ['Core.Hello', 'client.source', 'account.login'].includes(p));
        });
        expect(order).toEqual(['Core.Hello', 'client.source', 'account.login']);
    });

    test('only the direct connection offers creating an account', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#create-account-link')).toBeVisible();
        await page.locator('#proxy-mode-proxy').click();
        await expect(page.locator('#create-account-link')).toBeHidden();
        await page.locator('#proxy-mode-direct').click();
        await expect(page.locator('#create-account-link')).toBeVisible();
    });
});

test.describe('Konto on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('the character form fits the screen', async ({ page }) => {
        await logIntoAccount(page);
        await pushGmcp(page, 'account.options', OPTIONS);
        await pushGmcp(page, 'account.info', { email: 'gracz@example.com', chars: [] });
        await page.locator('#account-chars').getByRole('button', { name: 'Stwórz postać' }).click();
        await expect(page.locator('#account-create-char')).toBeVisible();
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(width).toBeLessThanOrEqual(390);
        await page.screenshot({ path: 'test-results/account-phone.png', fullPage: true });
    });
});
