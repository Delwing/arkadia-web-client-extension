import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, pushText, waitForCommandInput} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';

const LEGIONISTA = {
    name: 'tester', object_num: 12345, gender: 'male', race: 'czlowiek',
    guild_occ: 'Legionista', guild_lay: 'Kupcy z Bree', guild_rel: 'Kosciol Kreve',
};

test.describe('Character plaque', () => {
    test('on login the output shows the character: emblem, name, race and guilds - once', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushGmcp(page, 'char.info', LEGIONISTA);

        const plaque = page.locator('#main_text_output_msg_wrapper .plaque');
        await expect(plaque).toHaveCount(1);
        await expect(plaque.locator('.plaque__name')).toHaveText('Tester');
        await expect(plaque.locator('.plaque__sub')).toHaveText('Czlowiek · Legionista');
        await expect(plaque.locator('.plaque__crest--war svg path').first()).toBeAttached();
        await expect(plaque.locator('.plaque__gv')).toHaveText(['Kupcy z Bree', 'Kosciol Kreve']);

        // Re-sent for the same character (a guild change): no second plaque.
        await pushGmcp(page, 'char.info', {...LEGIONISTA, guild_rel: ''});
        await pushGmcp(page, 'char.info', {name: 'drugi', object_num: 999});
        await expect(plaque).toHaveCount(2);
    });

    test('turned off in Wygląd, no plaque', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        const modal = await openSettings(page, 'ui-appearance');
        await modal.locator('#ui-character-plaque').uncheck();
        await saveSettings(page);

        await pushGmcp(page, 'char.info', LEGIONISTA);
        // Anything after the login has landed, so the plaque would have too.
        await pushText(page, 'Witaj w Arkadii.');
        await expect(page.locator('#main_text_output_msg_wrapper')).toContainText('Witaj w Arkadii.');
        await expect(page.locator('.plaque')).toHaveCount(0);
    });
});
