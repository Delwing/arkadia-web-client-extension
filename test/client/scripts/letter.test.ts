import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import initLetter from '@client/scripts/letter';

function createClient(printed: string[]): Client {
    return new Client({
        send: () => {},
        output: (out?: string | AnsiAwareBuffer) => {
            printed.push(typeof out === 'string' ? out : (out?.text ?? ''));
        },
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

const PROMPT = 'Wpisz ~?, zeby uzyskac pomoc, lub **, by zakonczyc edycje.';

const submission = (extra: Record<string, unknown> = {}) => ({
    to: 'Ala',
    cc: '',
    udw: '',
    subject: 'Sprawa',
    content: 'Witaj przyjacielu.',
    template: 'plain',
    ...extra,
});

describe('letter', () => {
    let client: Client;
    let printed: string[];
    let commands: string[];
    let offCommand: () => void;

    function output() {
        client.sendEvent('output-sent', 1);
        const s = printed.join('');
        printed.length = 0;
        return s;
    }

    // initLetter subscribes to the global bus and never unsubscribes.
    beforeAll(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        printed = [];
        client = createClient(printed);
        initLetter(client, client.aliases);
    });

    beforeEach(() => {
        characterStorage.setCharacter('TestChar');
        printed.length = 0;
        commands = [];
        const sink = commands;
        offCommand = client.on('command', (c: string) => { sink.push(c); });
    });

    afterEach(() => offCommand());

    test('/list opens the composer', async () => {
        let opened = false;
        const off = client.on('letterComposer', () => { opened = true; });

        await client.sendCommand('/list');
        off();

        expect(opened).toBe(true);
    });

    describe('sending a letter', () => {
        test('the headers are sent in order', async () => {
            client.sendEvent('letterComposer.submit', submission({ cc: 'Bela' }) as any);
            await new Promise(r => setTimeout(r, 0));

            expect(commands.slice(0, 4)).toEqual(['napisz list', 'Ala', 'Sprawa', 'Bela']);
        });

        test('the body is only sent once the editor prompt arrives', async () => {
            client.sendEvent('letterComposer.submit', submission() as any);
            await new Promise(r => setTimeout(r, 0));
            expect(commands).not.toContain('**');

            client.onLine(PROMPT, 'text');
            await new Promise(r => setTimeout(r, 0));

            // The body is rendered into the template frame before it is sent.
            expect(commands.some(c => c.includes('Witaj przyjacielu.'))).toBe(true);
            expect(commands.at(-1)).toBe('**');
        });

        test('blind copies are added before the body', async () => {
            client.sendEvent('letterComposer.submit', submission({ udw: 'Cela Dela' }) as any);
            await new Promise(r => setTimeout(r, 0));
            commands.length = 0;

            client.onLine(PROMPT, 'text');
            await new Promise(r => setTimeout(r, 0));

            expect(commands[0]).toBe('~udw Cela');
            expect(commands[1]).toBe('~udw Dela');
        });

        test('surrounding whitespace in the headers is trimmed', async () => {
            client.sendEvent('letterComposer.submit', submission({ to: '  Ala  ', subject: '  Sprawa  ' }) as any);
            await new Promise(r => setTimeout(r, 0));

            expect(commands).toContain('Ala');
            expect(commands).toContain('Sprawa');
        });

        test('the prompt trigger only fires once', async () => {
            client.sendEvent('letterComposer.submit', submission() as any);
            await new Promise(r => setTimeout(r, 0));
            client.onLine(PROMPT, 'text');
            await new Promise(r => setTimeout(r, 0));
            commands.length = 0;

            client.onLine(PROMPT, 'text');
            await new Promise(r => setTimeout(r, 0));

            expect(commands).toEqual([]);
        });
    });

    describe('previewing', () => {
        test('the letter body is rendered', () => {
            client.sendEvent('letterComposer.preview', { content: 'Witaj przyjacielu.', template: 'plain' } as any);

            expect(output()).toContain('Witaj przyjacielu.');
        });

        test('an empty letter says so', () => {
            client.sendEvent('letterComposer.preview', { content: '', template: 'plain' } as any);

            expect(output()).toContain('(brak tresci)');
        });

        test('an unknown template falls back to plain', () => {
            client.sendEvent('letterComposer.preview', { content: 'Tresc.', template: 'nonsense' } as any);

            expect(output()).toContain('Tresc.');
        });

        test('long text is wrapped over several lines', () => {
            const long = 'slowo '.repeat(40).trim();

            client.sendEvent('letterComposer.preview', { content: long, template: 'plain' } as any);
            const out = output();

            // The body sits inside the template frame, so match on content.
            const bodyLines = out.split('\n').filter(l => l.includes('slowo'));
            expect(bodyLines.length).toBeGreaterThan(1);
        });

        test('the preview reports the configured width', () => {
            characterStorage.set('settings', { letterLineWidth: 40 } as any);

            client.sendEvent('letterComposer.preview', { content: 'Tresc.', template: 'plain' } as any);

            expect(output()).toContain('szerokosc 40');
        });

        test('the width is clamped to the allowed range', () => {
            characterStorage.set('settings', { letterLineWidth: 5 } as any);

            client.sendEvent('letterComposer.preview', { content: 'Tresc.', template: 'plain' } as any);

            // Minimum is 20, so 5 is clamped up.
            expect(output()).toContain('szerokosc 20');
        });

        test('the template is named in the header', () => {
            characterStorage.set('settings', { letterLineWidth: 72 } as any);

            client.sendEvent('letterComposer.preview', { content: 'Tresc.', template: 'plain' } as any);

            expect(output()).toContain('szablon');
        });
    });
});
