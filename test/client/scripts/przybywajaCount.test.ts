import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initPrzybywajaCount from '@client/scripts/przybywajaCount';

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

describe('przybywajaCount', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        initPrzybywajaCount(client);
    });

    test('counts a single arrival', () => {
        const [out] = client.onLine('Ala przybywa z polnocy.', 'other');

        expect(out.text).toBe('[1] Ala przybywa z polnocy.');
    });

    test('counts a comma-separated group', () => {
        const [out] = client.onLine('Ala, Bela i Cela przybywaja z polnocy.', 'other');

        expect(out.text).toBe('[3] Ala, Bela i Cela przybywaja z polnocy.');
    });

    test('expands a Polish number word into a headcount', () => {
        const [out] = client.onLine('trzej zolnierze przybywaja z polnocy.', 'other');

        expect(out.text).toBe('[3] trzej zolnierze przybywaja z polnocy.');
    });

    test('mixes counted groups with named arrivals', () => {
        const [out] = client.onLine('Ala i dwaj zolnierze przybywaja z polnocy.', 'other');

        expect(out.text).toBe('[3] Ala i dwaj zolnierze przybywaja z polnocy.');
    });

    test('handles the "podazaja" wording too', () => {
        const [out] = client.onLine('Ala i Bela podazaja na polnoc.', 'other');

        expect(out.text).toBe('[2] Ala i Bela podazaja na polnoc.');
    });

    test('highlights the movement verb', () => {
        const [out] = client.onLine('Ala przybywa z polnocy.', 'other');

        expect(out.toHtml()).toContain('#ccb3ff');
    });

    test('only applies to the "other" line type', () => {
        const line = 'Ala przybywa z polnocy.';

        const [out] = client.onLine(line, 'text');

        expect(out.text).toBe(line);
    });

    test('unrelated output is untouched', () => {
        const [out] = client.onLine('Jestes lekko zmeczony.', 'other');

        expect(out.text).toBe('Jestes lekko zmeczony.');
    });
});
