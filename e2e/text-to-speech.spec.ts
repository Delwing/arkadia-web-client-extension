import type {Page} from '@playwright/test';
import {expect, test} from './support/fixtures';
import {ensureGameSocket, primeCharInfo, pushText, waitForCommandInput} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';
import {addPatternTrigger, closeAutomation, openAutomation, row} from './support/automation';

/**
 * Headless Chromium has no audio device, so the browser's synthesizer is
 * replaced by a recorder — the one piece of the platform this spec stands in
 * for, the same way the mock socket stands in for the game server.
 */
async function recordSpeech(page: Page) {
    await page.addInitScript(() => {
        const spoken: {text: string; rate: number; volume: number}[] = [];
        (window as any).__spoken = spoken;
        const recorder = {
            speak: (u: SpeechSynthesisUtterance) => {
                spoken.push({text: u.text, rate: u.rate, volume: u.volume});
                setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 0);
            },
            cancel: () => undefined,
            resume: () => undefined,
            pause: () => undefined,
            getVoices: () => [],
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        };
        Object.defineProperty(window, 'speechSynthesis', {value: recorder, configurable: true});
    });
}

const spoken = (page: Page) => page.evaluate(() => (window as any).__spoken as {text: string; rate: number; volume: number}[]);

test('speak trigger reads its text with capture groups, using the TTS settings', async ({page}) => {
    await recordSpeech(page);
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);

    const settings = await openSettings(page, 'ui-sound');
    await expect(settings.locator('#ui-tts-voice'), 'should offer a voice picker').toBeVisible();
    await settings.locator('#ui-tts-rate').fill('1.5');
    await saveSettings(page);

    const modal = await openAutomation(page);
    await addPatternTrigger(page, modal, 'Atakuje cie (.+)!', async action => {
        await action.locator('select').first().selectOption('speak');
        await action.getByPlaceholder('Tekst do przeczytania (puste = dopasowany tekst)').fill('Atak: {1}');
    });
    await expect(row(modal, 'Atakuje cie'), 'should list the speak action').toContainText('czytaj "Atak: {1}"');
    await closeAutomation(modal);

    await pushText(page, 'Atakuje cie wielki troll!');

    await expect.poll(() => spoken(page), {message: 'should read the trigger text aloud'})
        .toEqual([{text: 'Atak: wielki troll', rate: 1.5, volume: 1}]);
});

test('turning TTS off silences speak triggers', async ({page}) => {
    await recordSpeech(page);
    await page.addInitScript(() => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('triggers', JSON.stringify([{pattern: 'Mow', macros: [{type: 'speak'}]}]));
    });
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);

    await pushText(page, 'Mow raz');
    await expect.poll(async () => (await spoken(page)).map(s => s.text)).toEqual(['Mow']);

    const settings = await openSettings(page, 'ui-sound');
    await settings.locator('#ui-tts-enabled').uncheck();
    await saveSettings(page);

    await pushText(page, 'Mow dwa');
    await pushText(page, 'Marker line');
    await expect(page.locator('#main_text_output_msg_wrapper')).toContainText('Marker line');
    expect((await spoken(page)).map(s => s.text), 'should not speak once TTS is off').toEqual(['Mow']);
});
