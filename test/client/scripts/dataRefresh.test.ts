import { describe, test, expect, beforeEach, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { getMagicsStore } from '@modules/data/dataStores/magicsStore';
import { getMagicKeysStore } from '@modules/data/dataStores/magicKeysStore';
import { getKnowledgeStore } from '@modules/data/dataStores/knowledgeStore';
import { getWiedzaStore } from '@modules/data/dataStores/wiedzaStore';
import { getKnowledgeDetailsStore } from '@modules/data/dataStores/knowledgeDetailsStore';
import initDataRefresh from '@client/scripts/dataRefresh';

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

describe('dataRefresh', () => {
    let client: Client;
    let printed: string[];

    function output() {
        client.sendEvent('output-sent', 1);
        const s = printed.join('');
        printed.length = 0;
        return s;
    }

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        printed = [];
        client = createClient(printed);
        initDataRefresh(client, client.aliases);
        vi.restoreAllMocks();
    });

    test('/refresh_magics forces a magics reload', async () => {
        const refresh = vi.spyOn(getMagicsStore(), 'refresh').mockResolvedValue(undefined as any);

        await client.sendCommand('/refresh_magics');

        expect(refresh).toHaveBeenCalledWith({ force: true });
        const out = output();
        expect(out).toContain('Odswiezanie danych magii...');
        expect(out).toContain('Dane magii odswiezone.');
    });

    test('/refresh_keys forces a magic-keys reload', async () => {
        const refresh = vi.spyOn(getMagicKeysStore(), 'refresh').mockResolvedValue(undefined as any);

        await client.sendCommand('/refresh_keys');

        expect(refresh).toHaveBeenCalledWith({ force: true });
        expect(output()).toContain('Dane kluczy magicznych odswiezone.');
    });

    test('/refresh_knowledge reloads all three knowledge stores', async () => {
        const a = vi.spyOn(getKnowledgeStore(), 'refresh').mockResolvedValue(undefined as any);
        const b = vi.spyOn(getWiedzaStore(), 'refresh').mockResolvedValue(undefined as any);
        const c = vi.spyOn(getKnowledgeDetailsStore(), 'refresh').mockResolvedValue(undefined as any);

        await client.sendCommand('/refresh_knowledge');

        expect(a).toHaveBeenCalledWith({ force: true });
        expect(b).toHaveBeenCalledWith({ force: true });
        expect(c).toHaveBeenCalledWith({ force: true });
        expect(output()).toContain('Dane wiedzy odswiezone.');
    });

    test('a failure is reported rather than thrown', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(getMagicsStore(), 'refresh').mockRejectedValue(new Error('offline'));

        await client.sendCommand('/refresh_magics');

        const out = output();
        expect(out).toContain('Blad odswiezania danych magii.');
        expect(out).not.toContain('Dane magii odswiezone.');
    });
});
