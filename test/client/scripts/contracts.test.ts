import { describe, it, expect } from 'vitest';
import { parseAmountAndItem, parsePolishDays, deadlinePattern } from '@client/scripts/contracts.ts';

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

describe('deadlinePattern', () => {
    const PREFIX = 'Niewysoki brazowooki mezczyzna mowi do ciebie:';

    it('matches a numbered deadline and parses the count', () => {
        const line = `${PREFIX} Na realizacje zamowienia mam siedemnascie dni, pozniej zapewne bede potrzebowac czego innego.`;
        const matches = line.match(deadlinePattern);
        expect(matches).not.toBeNull();
        expect(parsePolishDays(matches![1])).toBe(17);
    });

    it('matches a bare singular "dzien" with no number and defaults to one day', () => {
        // Reported case: "...mam dzien, ..." has no number word before the unit.
        const line = `${PREFIX} Na realizacje zamowienia mam dzien, pozniej zapewne bede potrzebowac czego innego.`;
        const matches = line.match(deadlinePattern);
        expect(matches).not.toBeNull();
        expect(matches![1]).toBeUndefined();
        expect(parsePolishDays(matches![1])).toBe(1);
    });

    it('matches a worded hours deadline', () => {
        const line = `${PREFIX} Na realizacje zamowienia mam kilka godzin, pozniej zapewne bede potrzebowac czego innego.`;
        const matches = line.match(deadlinePattern);
        expect(matches).not.toBeNull();
        expect(parsePolishDays(matches![1])).toBe(0.5);
    });
});

describe('parsePolishDays', () => {
    it('defaults to one day when given no number word', () => {
        expect(parsePolishDays(undefined)).toBe(1);
    });
});
