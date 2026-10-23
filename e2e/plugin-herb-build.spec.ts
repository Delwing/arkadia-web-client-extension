import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    getCommandLog,
    pushGmcp,
    pushText,
    resetCommandLog,
    submitCommand,
    waitForCharacter,
    waitForCommandInput,
    waitForOutputContaining,
} from './support/mocks';

const PLUGIN_URL = 'https://example.com/herb-build-probe.js';
const PLUGIN_NAME = 'Herb build probe';
// Loaded through the normal plugin UI. Only the game server is mocked: the
// alias, scanner, persistence, event bus and PluginApi all run for real.
const PLUGIN_SOURCE = `
let cleanup = () => {};
export async function init(api) {
    api.herbs.setBags({1: {herbs: {arnika: 3}}});
    let active = false;
    api.aliases.register(/^\\/probe-herbs$/, async () => {
        if (active) return;
        active = true;
        const previous = JSON.stringify(api.herbs.getBags());
        const done = async bags => {
            cleanup();
            api.output.print('HERB_BUILD_DONE bags=' + Object.keys(bags).length
                + ' saved=' + (JSON.stringify(api.herbs.getBags()) === JSON.stringify(bags)));
            await api.command.send('wloz woreczki do swojego worka');
            await api.command.send('zamknij swoj worek');
        };
        const failed = ({reason}) => {
            cleanup();
            api.output.print('HERB_BUILD_FAILED reason=' + reason
                + ' unchanged=' + (JSON.stringify(api.herbs.getBags()) === previous));
        };
        cleanup = () => {
            api.events.off('herbs.build.done', done);
            api.events.off('herbs.build.failed', failed);
            active = false;
        };
        api.events.on('herbs.build.done', done);
        api.events.on('herbs.build.failed', failed);
        await api.command.send('otworz swoj worek');
        await api.command.send('wez woreczki ze swojego worka');
        await api.command.send('/ziola_buduj');
    });
    return {name: '${PLUGIN_NAME}', version: '1.0.0'};
}
export function destroy() { cleanup(); }
`;

async function setup(page: Page) {
    await page.route(`${PLUGIN_URL}**`, route => route.fulfill({
        status: 200, contentType: 'application/javascript', body: PLUGIN_SOURCE,
    }));
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'HerbBuildTester', object_num: 60009});
    await waitForCharacter(page, 'HerbBuildTester');
    await page.click('#menu-button');
    await page.click('#scripts-button');
    const modal = page.locator('#scripts-modal');
    await modal.getByRole('button', {name: 'Dodaj plugin'}).click();
    await page.locator('.plugin-route', {hasText: 'Z adresu URL'}).click();
    const dialog = page.locator('.popup-dialog', {hasText: 'Dodaj skrypt z URL'}).last();
    await dialog.getByPlaceholder('URL skryptu').fill(PLUGIN_URL);
    await dialog.getByRole('button', {name: 'Dodaj', exact: true}).click();
    await expect(modal.getByText(PLUGIN_NAME)).toBeVisible();
    await modal.locator('.app-modal__close').first().click();
    await expect(modal).not.toBeVisible();
    await resetCommandLog(page);
    await submitCommand(page, '/probe-herbs');
    await expect.poll(() => getCommandLog(page)).toEqual([
        'otworz swoj worek', 'wez woreczki ze swojego worka', 'policz swoje woreczki',
    ]);
}

const EMPTY_BAG = 'Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojego woreczka. W jego srodku nic jednak nie ma.';

test('plugin runs post commands only after the complete native scan is saved', async ({page}) => {
    await setup(page);
    await pushText(page, 'Doliczyles sie dwoch sztuk.');
    await expect.poll(() => getCommandLog(page)).toContain('zajrzyj do 2. swojego woreczka');
    await pushText(page, EMPTY_BAG);
    await waitForOutputContaining(page, 'W jego srodku nic jednak nie ma.');
    expect(await getCommandLog(page)).not.toContain('wloz woreczki do swojego worka');
    await pushText(page, EMPTY_BAG);
    await waitForOutputContaining(page, 'HERB_BUILD_DONE bags=2 saved=true');
    await expect.poll(() => getCommandLog(page)).toEqual([
        'otworz swoj worek', 'wez woreczki ze swojego worka', 'policz swoje woreczki',
        'zajrzyj do 1. swojego woreczka', 'zajrzyj do 2. swojego woreczka',
        'wloz woreczki do swojego worka', 'zamknij swoj worek',
    ]);
    // A second invocation must not retain the previous event listeners.
    await resetCommandLog(page);
    await submitCommand(page, '/probe-herbs');
    await expect.poll(() => getCommandLog(page)).toContain('policz swoje woreczki');
    await pushText(page, 'Doliczyles sie jednej sztuki.');
    await expect.poll(() => getCommandLog(page)).toContain('zajrzyj do 1. swojego woreczka');
    await pushText(page, EMPTY_BAG);
    await waitForOutputContaining(page, 'HERB_BUILD_DONE bags=1 saved=true');
    await expect.poll(() => getCommandLog(page)).toContain('zamknij swoj worek');
    expect((await getCommandLog(page)).filter(c => c === 'wloz woreczki do swojego worka')).toHaveLength(1);
});

test('plugin receives no-bags failure and keeps the previous database', async ({page}) => {
    await setup(page);
    await pushText(page, 'Nie widzisz tu niczego takiego.');
    await waitForOutputContaining(page, 'HERB_BUILD_FAILED reason=no-bags unchanged=true');
    expect(await getCommandLog(page)).not.toContain('wloz woreczki do swojego worka');
});

test('a missing bag midway reports failure without saving a partial database', async ({page}) => {
    await setup(page);
    await pushText(page, 'Doliczyles sie dwoch sztuk.');
    await expect.poll(() => getCommandLog(page)).toContain('zajrzyj do 2. swojego woreczka');
    await pushText(page, EMPTY_BAG);
    await pushText(page, 'Zajrzyj do czego?');
    await waitForOutputContaining(page, 'HERB_BUILD_FAILED reason=no-bags unchanged=true');
    expect(await getCommandLog(page)).not.toContain('wloz woreczki do swojego worka');
});
