import initMagics from '@client/scripts/magics';
import { colorTokenInLine } from '@modules/core/Colors';
import { MAGICS_COLOR } from '@client/constants/colors';

describe('magics', () => {
    beforeEach(() => {
        localStorage.clear();
        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ magics: { a: { regexps: ['alpha'] }, b: { regexps: ['beta'] } } })
        });
    });

    test('registers triggers from remote list without localStorage', async () => {
        const client = { Triggers: { registerTokenTrigger: jest.fn() } } as any;
        await initMagics(client);
        expect(fetch).toHaveBeenCalled();
        expect(localStorage.getItem('magics')).toBeNull();
        expect(client.Triggers.registerTokenTrigger).toHaveBeenCalledTimes(2);
        const call = client.Triggers.registerTokenTrigger.mock.calls[0];
        const pattern = call[0];
        const callback = call[1];
        const sentence = 'to jest alpha w zdaniu';
        expect(callback(sentence, sentence, {} as any).toAnsiString()).toBe(colorTokenInLine(sentence, pattern, MAGICS_COLOR).toAnsiString());

        const titleCase = 'Alpha pojawila sie w zdaniu';
        expect(callback(titleCase, titleCase, {} as any).toAnsiString()).toBe(colorTokenInLine(titleCase, pattern, MAGICS_COLOR).toAnsiString());
    });
});
