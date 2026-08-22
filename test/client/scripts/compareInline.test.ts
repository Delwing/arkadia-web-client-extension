import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initCompareInline from '@client/scripts/compareInline';

function createClient(): Client {
    return new Client({
        send: () => {},
        output: () => {},
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

describe('compareInline', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        initCompareInline(client);
    });

    test('annotates each comparison with its numeric delta', () => {
        const [out] = client.onLine(
            'Wydaje ci sie, ze jestes duzo silniejszy, duzo lepiej zbudowany i zreczniejszy niz Goblin.',
            'text'
        );

        expect(out.text).toBe(
            'Wydaje ci sie, ze jestes duzo silniejszy (-5), duzo lepiej zbudowany (-5) i zreczniejszy (-3) niz Goblin.'
        );
    });

    test('being equal reads as 0', () => {
        const [out] = client.onLine(
            'Wydaje ci sie, ze jestes rownie silny jak Goblin.',
            'text'
        );

        expect(out.text).toContain('rownie silny (0)');
    });

    test('being weaker gives a positive delta', () => {
        const [out] = client.onLine(
            'Wydaje ci sie, ze jestes duzo slabszy niz Goblin.',
            'text'
        );

        expect(out.text).toContain('duzo slabszy (+5)');
    });

    test('"Masz wrazenie" is handled too', () => {
        const [out] = client.onLine(
            'Masz wrazenie, ze jestes silniejszy niz Goblin.',
            'text'
        );

        expect(out.text).toContain('silniejszy (-3)');
    });

    test('a stronger reading is green, a weaker one red, equal yellow', () => {
        expect(
            client.onLine('Wydaje ci sie, ze jestes silniejszy niz Goblin.', 'text')[0].toHtml()
        ).toContain('#00ff00');
        expect(
            client.onLine('Wydaje ci sie, ze jestes slabszy niz Goblin.', 'text')[0].toHtml()
        ).toContain('#ff0000');
        expect(
            client.onLine('Wydaje ci sie, ze jestes rownie silny jak Goblin.', 'text')[0].toHtml()
        ).toContain('#ffff00');
    });

    test('the most specific phrase wins over its shorter form', () => {
        // "znacznie silniejsz" must not be scored as the bare "silniejsz".
        const [out] = client.onLine(
            'Wydaje ci sie, ze jestes znacznie silniejszy niz Goblin.',
            'text'
        );

        expect(out.text).toContain('znacznie silniejszy (-4)');
        expect(out.text).not.toContain('(-3)');
    });

    test('unrelated output is untouched', () => {
        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.text).toBe('Jestes lekko zmeczony.');
    });
});
