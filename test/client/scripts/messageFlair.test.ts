import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { setRenderSettings } from '@modules/core/settings';
import initMessageFlair, { matchFlairCategory } from '@client/scripts/messageFlair';

function createClient(): Client {
    return new Client({
        send: () => {},
        output: () => {},
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => true,
    });
}

describe('matchFlairCategory', () => {
    test('tags own inventory lines', () => {
        expect(matchFlairCategory('Masz przy sobie Kartoflaka, dwa poreczne kompasy i 23 kurze jaja.')).toBe('ekwipunek');
        expect(matchFlairCategory('Na plecach nosisz prawie pusty zamkniety skorzany plecak.')).toBe('ekwipunek');
        expect(matchFlairCategory('Przy lewym boku masz przypiety kunsztowny skorzany temblak.')).toBe('ekwipunek');
        expect(matchFlairCategory('Do pasa masz przytroczone zamknieta sakiewke, lampe i skorzany buklak.')).toBe('ekwipunek');
        expect(matchFlairCategory('Masz przewieszony przez ramie brazowy krety rog.')).toBe('ekwipunek');
        expect(matchFlairCategory('Nosisz zamkniete skromne zawiniatko.')).toBe('ekwipunek');
    });

    test('tags body and loot lines', () => {
        expect(matchFlairCategory('Jest to martwe cialo wielkiego szczura.')).toBe('lup');
        expect(matchFlairCategory('Sa to smetne pozostalosci po jakims goblinie.')).toBe('lup');
        expect(matchFlairCategory('Zauwazasz przy nim 12 zlotych monet i rubin.')).toBe('lup');
        expect(matchFlairCategory('Zauwazasz przy niej maly cynowy kubek.')).toBe('lup');
    });

    test('tags character descriptions by their third-person forms', () => {
        expect(matchFlairCategory('Nosi na sobie kolczuge i ciezkie skorzane spodnie.')).toBe('opis');
        expect(matchFlairCategory('W rekach trzyma szczerbiony bojowy topor.')).toBe('opis');
        expect(matchFlairCategory('Na plecach nosi wypchany skorzany plecak.')).toBe('opis');
    });

    test('does not tag unrelated output', () => {
        expect(matchFlairCategory('Jestes lekko zmeczony.')).toBeNull();
        expect(matchFlairCategory('Rozgladasz sie dookola.')).toBeNull();
        // "Jest to ..." alone is far too broad to anchor descriptions on: it
        // opens plain object descriptions too.
        expect(matchFlairCategory('Jest to zwykly kamien polny.')).toBeNull();
    });

    test('separates own inventory from somebody else description', () => {
        expect(matchFlairCategory('Masz przy sobie lampe.')).toBe('ekwipunek');
        expect(matchFlairCategory('Ma przy sobie lampe.')).toBe('opis');
    });

    test('living.long wins over second-person inventory grammar', () => {
        // `ob siebie` reads exactly like your own inventory, so only the type
        // can tell them apart.
        const line = 'Na plecach nosisz prawie pusty zamkniety skorzany plecak.';
        expect(matchFlairCategory(line)).toBe('ekwipunek');
        expect(matchFlairCategory(line, 'living.long')).toBe('opis');
    });

    test('a body stays loot even under a description type', () => {
        expect(matchFlairCategory('Jest to martwe cialo wielkiego szczura.', 'living.long')).toBe('lup');
        expect(matchFlairCategory('Zauwazasz przy nim rubin.', 'living.long')).toBe('lup');
    });
});

describe('initMessageFlair', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
    });

    test('marks a matching line with its category', () => {
        setRenderSettings({ highlightMessageBlocks: true });
        initMessageFlair(client);

        const [out] = client.onLine('Masz przy sobie lampe i skorzany buklak.', 'text');

        expect(out.flair).toBe('ekwipunek');
    });

    test('leaves unrelated lines unmarked', () => {
        setRenderSettings({ highlightMessageBlocks: true });
        initMessageFlair(client);

        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.flair).toBeUndefined();
    });

    test('carries the marker across the multi-line packet merge', () => {
        setRenderSettings({ highlightMessageBlocks: true });
        initMessageFlair(client);

        const packet = [
            'Na plecach nosisz prawie pusty zamkniety skorzany plecak.',
            'Nosisz zamkniete skromne zawiniatko.',
            'Masz przy sobie Kartoflaka i dwa poreczne kompasy.',
        ].join('\n');

        const parts = client.onLine(packet, 'text');

        // The whole reply must land as ONE marked node, so the block is
        // decorated as a unit rather than once per line.
        expect(parts).toHaveLength(1);
        expect(parts[0].flair).toBe('ekwipunek');
        expect(parts[0].text).toContain('Kartoflaka');
    });

    test('tags a real `ob siebie` reply as a description, not inventory', () => {
        setRenderSettings({ highlightMessageBlocks: true });
        initMessageFlair(client);

        // Verbatim from the game: second person, and interleaving description
        // with worn gear — the case grammar alone gets wrong.
        const packet = [
            'Jestes zezowatym barylkowatym krasnoludem, znanym jako:',
            'Delwing z Twierdzy Karak Kadrin, Mlody Wedrowiec, krasnolud.',
            'Przy lewym boku masz przypiety kunsztowny skorzany temblak.',
            'Na plecach nosisz prawie pusty zamkniety skorzany plecak.',
            'Jestes w swietnej kondycji.',
            'Do pasa masz przytroczone zamknieta prowizoryczna plocienna sakiewke, lampe, skorzany buklak i gornicza lampe.',
            'Masz przewieszony przez ramie brazowy krety rog - symbol rozpoznawczy pocztylionow.',
            'Nosisz przywiazane do pasa kawalkiem sznurka, zamkniete skromne zawiniatko, pojemnik na mapy.',
        ].join('\n');

        const parts = client.onLine(packet, 'living.long');

        expect(parts).toHaveLength(1);
        expect(parts[0].flair).toBe('opis');
    });

    test('the same lines outside living.long stay inventory', () => {
        setRenderSettings({ highlightMessageBlocks: true });
        initMessageFlair(client);

        const packet = [
            'Przy lewym boku masz przypiety kunsztowny skorzany temblak.',
            'Na plecach nosisz prawie pusty zamkniety skorzany plecak.',
        ].join('\n');

        const parts = client.onLine(packet, 'other');

        expect(parts[0].flair).toBe('ekwipunek');
    });

    test('is off unless the setting is explicitly enabled', () => {
        // Deliberate product decision: opt-in, so a stored blob predating the
        // setting (and a fresh profile) leaves output untouched.
        initMessageFlair(client);

        const [out] = client.onLine('Masz przy sobie lampe.', 'text');

        expect(out.flair).toBeUndefined();
    });

    test('does not run while the setting is off', () => {
        setRenderSettings({ highlightMessageBlocks: false });
        initMessageFlair(client);

        const [out] = client.onLine('Masz przy sobie lampe.', 'text');

        expect(out.flair).toBeUndefined();
    });

    test('reacts to the setting being toggled at runtime', () => {
        setRenderSettings({ highlightMessageBlocks: false });
        initMessageFlair(client);
        setRenderSettings({ highlightMessageBlocks: true });

        const [out] = client.onLine('Masz przy sobie lampe.', 'text');

        expect(out.flair).toBe('ekwipunek');
    });

    test('clone keeps the marker, so a rewriting trigger cannot drop it', () => {
        const buffer = new AnsiAwareBuffer('Zauwazasz przy nim rubin.');
        buffer.flair = 'lup';

        expect(buffer.clone().flair).toBe('lup');
    });
});
