import { describe, test, expect, beforeEach, vi } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initSpiderWeb from '@client/scripts/spiderWeb';

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

describe('spiderWeb', () => {
    let client: Client;
    let setBind: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        setBind = vi.spyOn(client.FunctionalBind, 'set').mockImplementation(() => {});
        initSpiderWeb(client);
    });

    test.each([
        ['zaplatales', 'polnoc'],
        ['zaplatalas', 'wschod'],
    ])('binds the blocked direction for a retry (%s)', (form, dir) => {
        const line = `Probujesz sie ruszyc na ${dir}, jednak pajecze sieci, w ktore sie w miedzyczasie ${form}, uniemozliwiaja ci to.`;

        const [out] = client.onLine(line, 'text');

        expect(out.text).toBe(line);
        // clearAfterUse: the retry bind fires once.
        expect(setBind).toHaveBeenCalledWith(dir, undefined, true);
    });

    test('unrelated output does not touch the bind', () => {
        client.onLine('Idziesz na polnoc.', 'text');

        expect(setBind).not.toHaveBeenCalled();
    });
});
