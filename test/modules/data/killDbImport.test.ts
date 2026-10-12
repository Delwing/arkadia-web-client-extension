import { parseKillRows } from '@modules/data/killDbImport.shared';

describe('parseKillRows', () => {
    test('maps Mudlet day sums to kill store entries per character', () => {
        const result = parseKillRows([
            { character: 'Zelgadis', year: 2024, month: '05', day: '09', type: 'orka', amount: 3 },
            { character: 'Zelgadis', year: 2024, month: '05', day: '09', type: 'smoka chaosu', amount: 1 },
            { character: 'Amelia', year: 2023, month: 12, day: 31, type: 'Bergmunda', amount: 1 },
        ]);
        expect(result.characters).toEqual(['Amelia', 'Zelgadis']);
        expect(result.byCharacter.Zelgadis).toEqual([
            { mob: 'orka', date: '2024/5/9', count: 3 },
            { mob: 'smoka chaosu', date: '2024/5/9', count: 1 },
        ]);
        expect(result.byCharacter.Amelia).toEqual([{ mob: 'Bergmunda', date: '2023/12/31', count: 1 }]);
    });

    test('skips the daily "all" totals and broken rows, and sums duplicates', () => {
        const result = parseKillRows([
            { character: 'Zelgadis', year: 2024, month: 5, day: 9, type: 'all', amount: 9 },
            { character: 'Zelgadis', year: 2024, month: 5, day: 9, type: 'orka', amount: 2 },
            { character: 'Zelgadis', year: 2024, month: 5, day: 9, type: 'orka', amount: '3' },
            { character: '', year: 2024, month: 5, day: 9, type: 'orka', amount: 1 },
            { character: 'Zelgadis', year: 0, month: 5, day: 9, type: 'orka', amount: 1 },
            { character: 'Zelgadis', year: 2024, month: 5, day: 9, type: 'trolla', amount: 0 },
        ]);
        expect(result.byCharacter.Zelgadis).toEqual([{ mob: 'orka', date: '2024/5/9', count: 5 }]);
    });
});
