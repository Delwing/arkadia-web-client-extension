import initMagics from '@client/scripts/magics';
import { colorTokenInLine } from '@modules/core/Colors';
import { MAGICS_COLOR } from '@client/constants/colors';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

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
        const sentenceBuffer = new AnsiAwareBuffer(sentence);
        const result = callback(sentenceBuffer, [sentence] as RegExpMatchArray, '');
        const expected = colorTokenInLine(sentenceBuffer, pattern, MAGICS_COLOR);
        expect(result.text).toBe(expected.text);

        const titleCase = 'Alpha pojawila sie w zdaniu';
        const titleBuffer = new AnsiAwareBuffer(titleCase);
        const result2 = callback(titleBuffer, [titleCase] as RegExpMatchArray, '');
        const expected2 = colorTokenInLine(titleBuffer, pattern, MAGICS_COLOR);
        expect(result2.text).toBe(expected2.text);
    });

    test('registers a trigger per declined form of v3 data', async () => {
        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                version: 3,
                magics: {
                    'magiczny miecz': {
                        type: ['miecz'],
                        odmiana: {
                            mianownik: ['magiczny miecz'],
                            biernik: ['magiczny miecz'],
                            mnoga_mianownik: ['magiczne miecze'],
                        },
                    },
                },
            }),
        });
        // A fresh store singleton, so it binds the fetch above, with the cache of
        // the previous test dropped.
        jest.resetModules();
        const { getMagicsStore } = await import('@modules/data/dataStores/magicsStore');
        await getMagicsStore().clear();
        const { default: init } = await import('@client/scripts/magics');

        const client = { Triggers: { registerTokenTrigger: jest.fn() } } as any;
        await init(client);

        // The homograph mianownik/biernik is registered once.
        const patterns = client.Triggers.registerTokenTrigger.mock.calls.map((call: any[]) => call[0]);
        expect(patterns).toEqual(['magiczny miecz', 'magiczne miecze']);
    });
});
