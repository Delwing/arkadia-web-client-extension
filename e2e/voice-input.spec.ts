import type {Page} from '@playwright/test';
import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    pushText,
    waitForCommandInput,
    waitForOutputContaining,
} from './support/mocks';

/**
 * Chromium has no scriptable microphone, so the Web Speech API is stubbed the
 * same way the game socket is: a fake constructor installed before the app
 * boots, driven from the test to simulate the user speaking.
 */
async function installSpeechStub(page: Page, {pretendChrome = true} = {}): Promise<void> {
    await page.addInitScript((asChrome: boolean) => {
        class StubRecognition {
            lang = '';
            continuous = false;
            interimResults = false;
            maxAlternatives = 0;
            onresult: ((event: unknown) => void) | null = null;
            onerror: ((event: unknown) => void) | null = null;
            onend: (() => void) | null = null;

            constructor() {
                (window as unknown as Record<string, unknown>).__speechRecognition = this;
            }

            start(): void {}
            stop(): void {
                this.onend?.();
            }
            abort(): void {
                this.onend?.();
            }
        }

        (window as unknown as Record<string, unknown>).SpeechRecognition = StubRecognition;
        // The button is only offered to Chrome and Edge, whose vendors run a
        // speech service; headless Chromium brands itself as neither.
        if (asChrome) {
            Object.defineProperty(navigator, 'userAgentData', {
                get: () => ({brands: [{brand: 'Chromium', version: '131'}, {brand: 'Google Chrome', version: '131'}]}),
                configurable: true,
            });
        }
        (window as unknown as Record<string, unknown>).__speak = (transcripts: string[], isFinal: boolean) => {
            const recognition = (window as unknown as Record<string, any>).__speechRecognition;
            if (!recognition) throw new Error('Speech recognition was never started');
            const alternatives: Record<number | string, unknown> = {isFinal, length: transcripts.length};
            transcripts.forEach((transcript, i) => {
                alternatives[i] = {transcript};
            });
            const results: Record<number | string, unknown> = {length: 1};
            results[0] = alternatives;
            recognition.onresult?.({resultIndex: 0, results});
            // A hands-free stream stays open across utterances; a single-command
            // one closes itself, which is what ends the run.
            if (isFinal && !recognition.continuous) recognition.onend?.();
        };
    }, pretendChrome);
}

/** Say one utterance, optionally offering the recogniser's competing guesses. */
async function speak(page: Page, transcripts: string | string[], isFinal = true): Promise<void> {
    const list = Array.isArray(transcripts) ? transcripts : [transcripts];
    await page.evaluate(
        ([texts, final]) => {
            (window as unknown as Record<string, any>).__speak(texts, final);
        },
        [list, isFinal] as [string[], boolean],
    );
}

test.describe('voice input', () => {
    test.beforeEach(async ({page}) => {
        await installSpeechStub(page);
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    test('dictation fills the command line without sending', async ({page}) => {
        await page.locator('#voice-button').click();
        await speak(page, 'dobądź miecz.');

        await expect(page.locator('#message-input')).toHaveValue('dobadz miecz');
        expect(await getLastOutgoingCommand(page)).not.toBe('dobadz miecz');
    });

    test('the user still sends the dictated command manually', async ({page}) => {
        await page.locator('#voice-button').click();
        await speak(page, 'północ');

        await page.locator('#message-input').press('Enter');

        expect(await getLastOutgoingCommand(page)).toBe('polnoc');
    });

    test('interim results are replaced, not appended', async ({page}) => {
        await page.locator('#voice-button').click();
        await speak(page, 'zabij', false);
        await speak(page, 'zabij orka', true);

        await expect(page.locator('#message-input')).toHaveValue('zabij orka');
    });

    test('the button shows that it is listening', async ({page}) => {
        const button = page.locator('#voice-button');

        await button.click();
        await expect(button).toHaveClass(/listening/);

        await speak(page, 'rozejrzyj sie');
        await expect(button).not.toHaveClass(/listening/);
    });

    test('a word on screen beats the recogniser rescoring it away', async ({page}) => {
        await pushText(page, 'Ogrzyca warczy na ciebie z gestwiny.');
        await pushText(page, 'Widzisz tu: ogrzyce, zardzewialy miecz.');
        await waitForOutputContaining(page, 'ogrzyc');

        await page.locator('#voice-button').click();
        // What the browser actually does: the phonetic guess is demoted in
        // favour of common Polish that means nothing in the game.
        await speak(page, ['zaslon o grzybice', 'zaslon ogrzyce']);

        await expect(page.locator('#message-input')).toHaveValue('zaslon ogrzyce');
    });

    test('a rescored word is repaired from what is on screen', async ({page}) => {
        await pushText(page, 'Widzisz tu: ogrzyce, zardzewialy miecz.');
        await waitForOutputContaining(page, 'ogrzyc');

        await page.locator('#voice-button').click();
        await speak(page, ['zaslon o grzybice']);

        await expect(page.locator('#message-input')).toHaveValue('zaslon ogrzyce');
    });
});

test.describe('voice input in an unsupported browser', () => {
    test('no button is offered where the API would only fail', async ({page}) => {
        // Everything but the browser identity: the API is there, but this
        // build has no speech service behind it, as in Brave or Chromium.
        await installSpeechStub(page, {pretendChrome: false});
        await page.goto('/');
        await waitForCommandInput(page);

        await expect(page.locator('#voice-button')).toBeHidden();
    });
});

test.describe('hands-free voice input', () => {
    test.beforeEach(async ({page}) => {
        await installSpeechStub(page);
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    test('shift-click keeps the microphone open', async ({page}) => {
        const button = page.locator('#voice-button');

        await button.click({modifiers: ['Shift']});

        await expect(button).toHaveClass(/listening-continuous/);
        await speak(page, 'polnoc');
        // A single-utterance run would have ended here.
        await expect(button).toHaveClass(/listening-continuous/);
    });

    test('saying the send keyword sends the line', async ({page}) => {
        await page.locator('#voice-button').click({modifiers: ['Shift']});

        await speak(page, 'polnoc');
        expect(await getLastOutgoingCommand(page)).not.toBe('polnoc');

        await speak(page, 'wyslij');

        expect(await getLastOutgoingCommand(page)).toBe('polnoc');
        await expect(page.locator('#message-input')).toHaveValue('');
    });

    test('the keyword works at the end of the same utterance', async ({page}) => {
        await page.locator('#voice-button').click({modifiers: ['Shift']});

        await speak(page, 'wschod wyslij');

        expect(await getLastOutgoingCommand(page)).toBe('wschod');
    });

    test('a near miss on the keyword still sends', async ({page}) => {
        await page.locator('#voice-button').click({modifiers: ['Shift']});

        // "wyslij" is short and unstressed; this is what comes back instead.
        await speak(page, 'polnoc wyszli');

        expect(await getLastOutgoingCommand(page)).toBe('polnoc');
    });

    test('a diagonal direction is hyphenated the way the game wants it', async ({page}) => {
        await page.locator('#voice-button').click({modifiers: ['Shift']});

        await speak(page, 'północny zachód wyslij');

        expect(await getLastOutgoingCommand(page)).toBe('polnocny-zachod');
    });

    test('a spoken number is sent as a digit', async ({page}) => {
        await page.locator('#voice-button').click({modifiers: ['Shift']});

        await speak(page, 'wybierz paczke jeden wyslij');

        expect(await getLastOutgoingCommand(page)).toBe('wybierz paczke 1');
    });

    test('a command announced twice is only sent once', async ({page}) => {
        await page.locator('#voice-button').click({modifiers: ['Shift']});

        // What mobile Chrome does: the final result arrives again a moment later.
        await speak(page, 'szczelina enter');
        await speak(page, 'szczelina enter');

        const sent = await page.evaluate(() => {
            const sockets: any[] = (window as any).__mockSockets ?? [];
            const commands = sockets.flatMap((socket) => socket?.commands ?? []);
            return commands.filter((command: string) => command === 'szczelina').length;
        });
        expect(sent).toBe(1);
    });

    test('a misheard line can be thrown away by voice', async ({page}) => {
        await page.locator('#voice-button').click({modifiers: ['Shift']});

        await speak(page, 'zabij o grzybice');
        await speak(page, 'anuluj');

        await expect(page.locator('#message-input')).toHaveValue('');
    });
});
