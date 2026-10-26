import { parseDepositBox, parseDepositRows } from '@modules/data/depositDbImport.shared';

describe('parseDepositBox', () => {
    test('reads every form Mudlet saves a deposit in', () => {
        expect(parseDepositBox('Twoj depozyt zawiera dwie zlote monety i miecz')).toBe('dwie zlote monety i miecz');
        expect(parseDepositBox('dwie zlote monety i miecz')).toBe('dwie zlote monety i miecz');
        expect(parseDepositBox('Twoj depozyt jest pusty')).toBe('');
        expect(parseDepositBox('Nie posiadasz wykupionego depozytu')).toBeNull();
        expect(parseDepositBox('Nie posiadasz wykupionego depozytu.')).toBeNull();
        expect(parseDepositBox('')).toBeUndefined();
    });
});

describe('parseDepositRows', () => {
    test('maps Mudlet banks to their rooms per character', () => {
        const result = parseDepositRows([
            { character: 'Zelgadis', bank: 'ebino', box: 'Twoj depozyt zawiera miecz' },
            { character: 'Zelgadis', bank: "val'kare", box: 'Twoj depozyt jest pusty' },
            { character: 'Amelia', bank: 'novigrad', box: 'Nie posiadasz wykupionego depozytu' },
        ]);
        expect(result.characters).toEqual(['Amelia', 'Zelgadis']);
        expect(result.byCharacter.Zelgadis).toEqual([
            { bank: 'ebino', roomId: 5364, content: 'miecz' },
            { bank: "val'kare", roomId: 20164, content: '' },
        ]);
        expect(result.byCharacter.Amelia).toEqual([{ bank: 'novigrad', roomId: 2687, content: null }]);
        expect(result.unknownBanks).toEqual([]);
    });

    test('skips unknown banks, never-saved boxes and broken rows', () => {
        const result = parseDepositRows([
            { character: 'Zelgadis', bank: 'atlantyda', box: 'miecz' },
            { character: 'Zelgadis', bank: 'ebino', box: '' },
            { character: 'Zelgadis', bank: 'ebino', box: null },
            { character: '', bank: 'ebino', box: 'miecz' },
        ]);
        expect(result.characters).toEqual([]);
        expect(result.unknownBanks).toEqual(['atlantyda']);
    });
});
