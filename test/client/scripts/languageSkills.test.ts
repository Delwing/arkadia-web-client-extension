import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initLanguageSkills from '@client/scripts/languageSkills';

function createClient(sent: string[]): Client {
    return new Client({
        send: (text: string) => { sent.push(text); },
        output: () => {},
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

describe('languageSkills', () => {
    let client: Client;
    let sent: string[];

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        sent = [];
        client = createClient(sent);
        initLanguageSkills(client, client.aliases);
    });

    afterEach(() => vi.useRealTimers());

    describe('jezyki', () => {
        test('passes the command through to the game', async () => {
            await client.sendCommand('jezyki');

            expect(sent).toContain('jezyki');
        });

        test('draws a gauge next to each language', async () => {
            await client.sendCommand('jezyki');

            const [out] = client.onLine('  wspolna: dobra', 'text');

            expect(out.text).toContain('wspolna: ');
            expect(out.text).toContain('[======    ]');
        });

        test('the level word is padded to a fixed width', async () => {
            // Only the level column is padded (to 12, the width of "prawie
            // pelna"). The name prefix keeps its original spacing, so gauges
            // line up between rows with equal-length names, not across all rows.
            await client.sendCommand('jezyki');

            const [out] = client.onLine('  wspolna: dobra', 'text');

            expect(out.text).toContain('dobra' + ' '.repeat(7) + ' [');
        });

        test('rows with equal-length names line up', async () => {
            await client.sendCommand('jezyki');

            // Both names are 7 characters, so only the level padding matters.
            const [out] = client.onLine('  wspolna: dobra\n  skellig: pelna', 'text');
            const lines = out.text.split('\n');

            expect(lines[0].indexOf('[')).toBe(lines[1].indexOf('['));
        });

        test('an unknown level is left as-is', async () => {
            await client.sendCommand('jezyki');

            const [out] = client.onLine('  wspolna: jakas dziwna', 'text');

            expect(out.text).toContain('wspolna: jakas dziwna');
            expect(out.text).not.toContain('[');
        });

        test('lines that are not language rows pass through', async () => {
            await client.sendCommand('jezyki');

            const [out] = client.onLine('Znasz nastepujace jezyki\n  wspolna: dobra', 'text');

            expect(out.text).toContain('Znasz nastepujace jezyki');
        });

        test('capture stops after the reply', async () => {
            await client.sendCommand('jezyki');
            client.onLine('  wspolna: dobra', 'text');

            const [out] = client.onLine('  wspolna: dobra', 'text');

            expect(out.text).not.toContain('[');
        });

        test('capture stops after a second if no reply arrives', async () => {
            await client.sendCommand('jezyki');

            vi.advanceTimersByTime(1000);
            const [out] = client.onLine('  wspolna: dobra', 'text');

            expect(out.text).not.toContain('[');
        });

        test('nothing is captured before the command', () => {
            const [out] = client.onLine('  wspolna: dobra', 'text');

            expect(out.text).toBe('  wspolna: dobra');
        });
    });

    describe('jezyki maksymalne', () => {
        test('passes the command through and records the ceilings', async () => {
            await client.sendCommand('jezyki maksymalne');

            expect(sent).toContain('jezyki maksymalne');

            client.onLine('  wspolna: pelna\n  starsza mowa: dobra', 'text');

            expect(characterStorage.get('language_max_levels')).toEqual({
                wspolna: 10,
                'starsza mowa': 6,
            });
        });

        test('the max listing itself is not gauged', async () => {
            await client.sendCommand('jezyki maksymalne');

            const [out] = client.onLine('  wspolna: pelna', 'text');

            expect(out.text).toBe('  wspolna: pelna');
        });

        test('a recorded ceiling shortens the gauge', async () => {
            await client.sendCommand('jezyki maksymalne');
            client.onLine('  wspolna: dobra', 'text');

            await client.sendCommand('jezyki');
            const [out] = client.onLine('  wspolna: niezla', 'text');

            // max 6, current 4
            expect(out.text).toContain('[====  ]');
        });

        test('without a ceiling the gauge assumes 10', async () => {
            await client.sendCommand('jezyki');

            const [out] = client.onLine('  wspolna: niezla', 'text');

            expect(out.text).toContain('[====      ]');
        });
    });
});
