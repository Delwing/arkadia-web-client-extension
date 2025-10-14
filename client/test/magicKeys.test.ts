jest.mock('../src/dataCatalog/catalogInstance', () => ({
    dataCatalog: {
        getMagicKeysStore: () => ({
            getData: jest.fn(async () => {
                const response = await (globalThis.fetch as any)('magic_keys');
                return response.json();
            }),
        }),
    },
}));

import initMagicKeys, { KEYS_COLOR } from '../src/scripts/magicKeys';
import { colorTokenInLine } from '../src/Colors';

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
        expect(callback(sentence, sentence, {} as any)).toBe(colorTokenInLine(sentence, pattern, KEYS_COLOR));

        const titleCase = 'Alpha pojawila sie w zdaniu';
        expect(callback(titleCase, titleCase, {} as any)).toBe(colorTokenInLine(titleCase, pattern, KEYS_COLOR));
    });
});
