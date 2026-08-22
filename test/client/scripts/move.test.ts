import { describe, test, expect, beforeEach, vi } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initMove from '@client/scripts/move';

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

describe('move', () => {
    let client: Client;
    let followMove: ReturnType<typeof vi.spyOn>;
    let refresh: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        followMove = vi.spyOn(client.Map, 'followMove').mockReturnValue(true as any);
        refresh = vi.spyOn(client.Map, 'refresh').mockReturnValue(true as any);
        initMove(client);
    });

    describe('following somebody', () => {
        test('tries the trailing words of the name until one is a known exit', () => {
            followMove.mockReturnValue(false as any);

            client.onLine('Podazasz za wysokim elfem.', 'text');

            // Last word first, with the full name as context.
            expect(followMove).toHaveBeenNthCalledWith(1, 'elfem', 'wysokim elfem');
        });

        test('stops at the first word that works', () => {
            followMove.mockReturnValue(true as any);

            client.onLine('Podazasz za wysokim elfem.', 'text');

            expect(followMove).toHaveBeenCalledTimes(1);
        });

        test('sneaking after somebody is matched as well', () => {
            const [out] = client.onLine('Podazasz skradajac sie za wysokim goblinem.', 'text');

            expect(out.text).toBe('Podazasz skradajac sie za wysokim goblinem.');
            expect(followMove).toHaveBeenCalledWith('goblinem', 'wysokim goblinem');
        });

        test('a single-word name resolves nothing', () => {
            // Pins current behaviour: the candidate loop starts at 1 and indexes
            // from the end, so a one-token name is never tried at all.
            client.onLine('Podazasz za goblinem.', 'text');

            expect(followMove).not.toHaveBeenCalled();
        });
    });

    describe('being carried', () => {
        test.each([
            ['Wraz z Ala jedziesz powoli wozem na polnoc.', 'polnoc'],
            ['Wraz z Ala zjezdzasz szybko bryczka na poludnie.', 'poludnie'],
            ['Wraz z Ala wjezdzasz wolno dylizansem do bramy.', 'do bramy'],
        ])('a cart ride follows the direction: %s', (line, direction) => {
            client.onLine(line, 'text');

            expect(followMove).toHaveBeenCalledWith(direction);
        });

        test('swimming behind somebody follows the direction', () => {
            client.onLine('Skryty za Ala zaczynasz plynac na polnoc.', 'text');

            expect(followMove).toHaveBeenCalledWith('polnoc');
        });

        test('a boat being steered follows the direction', () => {
            client.onLine('Ala kieruje lodz na wschod.', 'text');

            expect(followMove).toHaveBeenCalledWith('wschod');
        });

        test.each([
            'Wraz z Ala pomagacie Beli przeniesc skrzynie na polnoc.',
            'Pomagasz Beli przeniesc skrzynie do bramy.',
        ])('carrying something together follows the direction: %s', (line) => {
            client.onLine(line, 'text');

            expect(followMove).toHaveBeenCalled();
        });
    });

    describe('the walker', () => {
        test('a step during a walk follows the direction', () => {
            client.onLine("Wykonuje komende 'idz polnoc'", 'text');
            followMove.mockClear();

            client.onLine('Ruszasz marszem na polnoc.', 'text');

            expect(followMove).toHaveBeenCalledWith('polnoc');
        });

        test('a step the mapper does not know triggers a refresh', () => {
            client.onLine("Wykonuje komende 'idz polnoc'", 'text');
            followMove.mockReturnValue(false as any);

            client.onLine('Ruszasz biegiem na wschod.', 'text');

            expect(refresh).toHaveBeenCalled();
        });

        test('an unrecognised line during a walk asks for a refresh', () => {
            client.onLine("Wykonuje komende 'idz polnoc'", 'text');
            refresh.mockReturnValue(false as any);

            client.onLine('Cos zupelnie innego.', 'text');

            expect(client.Map.refreshPosition).toBe(true);
        });

        test('interrupting the walk clears the pending refresh', () => {
            client.Map.refreshPosition = true;

            client.onLine("Wykonywanie komendy 'idz polnoc' zostaje przerwane.", 'text');

            expect(client.Map.refreshPosition).toBe(false);
        });

        test('lines outside a walk are not treated as steps', () => {
            client.onLine('Ruszasz marszem na polnoc.', 'text');

            expect(followMove).not.toHaveBeenCalled();
        });
    });

    test('unrelated output is untouched', () => {
        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.text).toBe('Jestes lekko zmeczony.');
        expect(followMove).not.toHaveBeenCalled();
    });
});
