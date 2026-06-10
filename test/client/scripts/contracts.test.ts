import { describe, it, expect } from 'vitest';
import { parseAmountAndItem } from '@client/scripts/contracts.ts';

describe('parseAmountAndItem', () => {
    it('parses a one-word number, dropping the generic "sztuk" counter', () => {
        expect(parseAmountAndItem('trzy sztuk mieczy')).toEqual({
            count: 3,
            unit: undefined,
            item: 'mieczy',
        });
    });

    it('parses a two-word number, dropping the generic "sztuk" counter', () => {
        expect(parseAmountAndItem('dwudziestu dwoch sztuk plucnicy')).toEqual({
            count: 22,
            unit: undefined,
            item: 'plucnicy',
        });
    });

    it('parses a one-word number followed by a descriptor (no counter)', () => {
        // "czterech srednich ryb morskich" -> 4 x srednich ryb morskich
        expect(parseAmountAndItem('czterech srednich ryb morskich')).toEqual({
            count: 4,
            item: 'srednich ryb morskich',
        });
    });

    it('parses a weight order with "kilogramow" as the kg unit', () => {
        // "dziesieciu kilogramow miesa z bazanta" -> 10 kg miesa z bazanta
        expect(parseAmountAndItem('dziesieciu kilogramow miesa z bazanta')).toEqual({
            count: 10,
            unit: 'kg',
            item: 'miesa z bazanta',
        });
    });

    it('parses a number without any counter or unit', () => {
        expect(parseAmountAndItem('czterech tarcz')).toEqual({
            count: 4,
            item: 'tarcz',
        });
    });

    it('handles a singular item where the number is the only count word', () => {
        expect(parseAmountAndItem('jednej dwurecznej broni klujacej')).toEqual({
            count: 1,
            item: 'dwurecznej broni klujacej',
        });
    });

    it('falls back to count 1 when the leading word is not a number', () => {
        expect(parseAmountAndItem('jakies dziwne zamowienie')).toEqual({
            count: 1,
            item: 'jakies dziwne zamowienie',
        });
    });

    it('parses a numeric digit count', () => {
        expect(parseAmountAndItem('15 sztuk strzal')).toEqual({
            count: 15,
            unit: undefined,
            item: 'strzal',
        });
    });
});
