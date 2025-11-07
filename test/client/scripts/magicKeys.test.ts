import initMagicKeys from '@client/scripts/magicKeys';
import { colorTokenInLine } from '@modules/core/Colors';
import { MAGIC_KEYS_COLOR as KEYS_COLOR } from '@client/constants/colors';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

describe('magic keys', () => {
    beforeEach(() => {
        localStorage.clear();
        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ magic_keys: ['alpha', 'beta'] })
        });
    });

    test('registers triggers from remote list without localStorage', async () => {
        const client = { Triggers: { registerTokenTrigger: jest.fn() } } as any;
        await initMagicKeys(client);
        expect(fetch).toHaveBeenCalled();
        expect(localStorage.getItem('magic_keys')).toBeNull();
        expect(client.Triggers.registerTokenTrigger).toHaveBeenCalledTimes(2);
        const call = client.Triggers.registerTokenTrigger.mock.calls[0];
        const pattern = call[0];
        const callback = call[1];

        const sentence = 'to jest alpha w zdaniu';
        const sentenceBuffer = new AnsiAwareBuffer(sentence);
        const result = callback(sentenceBuffer, [sentence] as RegExpMatchArray, '');
        const expected = colorTokenInLine(sentenceBuffer, pattern, KEYS_COLOR);
        expect(result.text).toBe(expected.text);

        const titleCase = 'Alpha pojawila sie w zdaniu';
        const titleBuffer = new AnsiAwareBuffer(titleCase);
        const result2 = callback(titleBuffer, [titleCase] as RegExpMatchArray, '');
        const expected2 = colorTokenInLine(titleBuffer, pattern, KEYS_COLOR);
        expect(result2.text).toBe(expected2.text);
    });
});
