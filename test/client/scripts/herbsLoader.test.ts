import loadHerbs from '@client/scripts/lib/herbsLoader';

describe('herbs loader', () => {
    beforeEach(() => {
        localStorage.clear();
        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                herb_id_to_odmiana: {
                    test: {
                        mianownik: 'a',
                        dopelniacz: 'b',
                        biernik: 'a',
                        mnoga_mianownik: 'c',
                        mnoga_dopelniacz: 'd',
                        mnoga_biernik: 'c'
                    }
                },
                version: 1,
                herb_id_to_use: { test: [{ action: 'eat', effect: '+hp' }] }
            })
        });
    });

    test('loads herbs without using localStorage', async () => {
        const data = await loadHerbs();
        expect(fetch).toHaveBeenCalled();
        expect(data?.version).toBe(1);
        expect(localStorage.getItem('herbs_data')).toBeNull();
    });
});
