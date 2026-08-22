import { describe, test, expect, beforeEach, vi } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initLanguageTeacher from '@client/scripts/languageTeacher';

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

describe('languageTeacher', () => {
    let client: Client;
    let setBind: ReturnType<typeof vi.spyOn>;

    function objects(list: { num: number; desc: string }[]) {
        client.ObjectManager.getObjectsOnLocation = () => list as any;
    }

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        setBind = vi.spyOn(client.FunctionalBind, 'set').mockImplementation(() => {});
        initLanguageTeacher(client);
    });

    test.each([
        'stary elf chce cie uczyc mowic po starszej mowie.',
        'stary elf chce cie uczyc mowic w jezyku starszej mowy.',
    ])('offers a learning bind: %s', (line) => {
        objects([{ num: 42, desc: 'stary elf' }]);

        const [out] = client.onLine(line, 'text');

        expect(out.text).toBe(line);
        expect(setBind).toHaveBeenCalledWith(
            'jucz sie jezyka od stary elf',
            expect.any(Function)
        );
    });

    test('the bind targets the teacher object', () => {
        objects([{ num: 42, desc: 'stary elf' }]);
        const sent: string[] = [];
        client.sendCommand = (async (c: string) => { sent.push(c); }) as any;

        client.onLine('stary elf chce cie uczyc mowic po starszej mowie.', 'text');
        (setBind.mock.calls.at(-1)![1] as () => void)();

        expect(sent).toEqual(['jucz sie jezyka od ob_42']);
    });

    test('matches on the first three words of a longer description', () => {
        objects([{ num: 7, desc: 'stary siwy elf w zielonym plaszczu' }]);

        client.onLine('stary siwy elf chce cie uczyc mowic po starszej mowie.', 'text');

        expect(setBind).toHaveBeenCalled();
    });

    test('matching is case-insensitive', () => {
        objects([{ num: 7, desc: 'Stary Elf' }]);

        client.onLine('stary elf chce cie uczyc mowic po starszej mowie.', 'text');

        expect(setBind).toHaveBeenCalled();
    });

    test('no bind when the teacher is not on the location', () => {
        objects([{ num: 7, desc: 'mlody krasnolud' }]);

        client.onLine('stary elf chce cie uczyc mowic po starszej mowie.', 'text');

        expect(setBind).not.toHaveBeenCalled();
    });

    test('unrelated output is untouched', () => {
        objects([{ num: 7, desc: 'stary elf' }]);

        client.onLine('stary elf sie usmiecha.', 'text');

        expect(setBind).not.toHaveBeenCalled();
    });
});
