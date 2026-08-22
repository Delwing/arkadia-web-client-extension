import { describe, test, expect, beforeEach, vi } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initTropBind from '@client/scripts/trop';

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

describe('trop', () => {
    let client: Client;
    let setBind: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        setBind = vi.spyOn(client.FunctionalBind, 'set').mockImplementation(() => {});
        initTropBind(client);
    });

    test('offers a "trop" bind when a team member points down', () => {
        client.TeamManager.isInTeam = (name: string) => name === 'Ala';

        const [out] = client.onLine('Ala wskazuje na dol.', 'text');

        expect(out.text).toBe('Ala wskazuje na dol.');
        expect(setBind).toHaveBeenCalledWith('trop');
    });

    test('ignores somebody outside the team', () => {
        client.TeamManager.isInTeam = () => false;

        client.onLine('Obcy wskazuje na dol.', 'text');

        expect(setBind).not.toHaveBeenCalled();
    });

    test('handles the bracketed form the game sometimes prints', () => {
        const seen: string[] = [];
        client.TeamManager.isInTeam = (name: string) => { seen.push(name); return true; };

        client.onLine('[Ala] wskazuje na dol.', 'text');

        expect(setBind).toHaveBeenCalledWith('trop');
        expect(seen[0]).toContain('Ala');
    });

    test('unrelated output does not touch the bind', () => {
        client.TeamManager.isInTeam = () => true;

        client.onLine('Ala idzie na polnoc.', 'text');

        expect(setBind).not.toHaveBeenCalled();
    });
});
