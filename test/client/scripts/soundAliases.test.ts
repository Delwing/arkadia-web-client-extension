import { describe, test, expect, beforeEach, vi } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import initSoundAliases from '@client/scripts/soundAliases';

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

describe('soundAliases', () => {
    let client: Client;
    let printed: string[];

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        printed = [];
        client = createClient(printed);
        initSoundAliases(client, client.aliases);
    });

    test('/mute silences sound and says so', async () => {
        const mute = vi.spyOn(client.SoundManager, 'mute').mockImplementation(() => {});

        await client.sendCommand('/mute');

        expect(mute).toHaveBeenCalled();
        expect(printed.join('')).toContain('Dzwieki wyciszone.');
    });

    test('/unmute restores sound and says so', async () => {
        const unmute = vi.spyOn(client.SoundManager, 'unmute').mockImplementation(() => {});

        await client.sendCommand('/unmute');

        expect(unmute).toHaveBeenCalled();
        expect(printed.join('')).toContain('Dzwieki wlaczone.');
    });

    test('/sounds toggles and reports the resulting state', async () => {
        const toggle = vi.spyOn(client.SoundManager, 'toggleMute').mockReturnValue(true);

        await client.sendCommand('/sounds');
        expect(printed.join('')).toContain('Dzwieki wyciszone.');

        printed.length = 0;
        toggle.mockReturnValue(false);

        await client.sendCommand('/sounds');
        expect(printed.join('')).toContain('Dzwieki wlaczone.');
    });
});
