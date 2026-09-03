import {describe, expect, it} from 'vitest';
import {spokenNumbersToDigits} from '@web/voice/numberWords';

describe('spokenNumbersToDigits', () => {
    it('turns a spoken number into the digit the game wants', () => {
        expect(spokenNumbersToDigits('wybierz paczke jeden')).toBe('wybierz paczke 1');
    });

    it.each([
        ['zero', '0'],
        ['dwa', '2'],
        ['dwie', '2'],
        ['trzy', '3'],
        ['dziesiec', '10'],
        ['dwanascie', '12'],
        ['dziewietnascie', '19'],
        ['dwadziescia', '20'],
        ['dziewiecdziesiat', '90'],
    ])('reads %s as %s', (spoken, digits) => {
        expect(spokenNumbersToDigits(spoken)).toBe(digits);
    });

    it('folds the gendered forms of one and two together', () => {
        expect(spokenNumbersToDigits('jeden jedna jedno')).toBe('1 1 1');
    });

    it('joins a two-word number', () => {
        expect(spokenNumbersToDigits('wez dwadziescia jeden monet')).toBe('wez 21 monet');
        expect(spokenNumbersToDigits('czterdziesci piec')).toBe('45');
    });

    it('leaves a hundred standing alone rather than gluing a unit on', () => {
        expect(spokenNumbersToDigits('sto')).toBe('100');
    });

    it('leaves ordinary words alone', () => {
        expect(spokenNumbersToDigits('zabij orka')).toBe('zabij orka');
    });

    it('defers to the screen for a word that is also a thing', () => {
        // "piec" is five, but it is also a stove standing in the room.
        const onScreen = (word: string) => word === 'piec';
        expect(spokenNumbersToDigits('rozpal piec', onScreen)).toBe('rozpal piec');
        expect(spokenNumbersToDigits('wez piec monet')).toBe('wez 5 monet');
    });

    it('does not use an ambiguous word as the tail of a bigger number', () => {
        const onScreen = (word: string) => word === 'piec';
        expect(spokenNumbersToDigits('dwadziescia piec', onScreen)).toBe('20 piec');
    });

    it('handles an empty line', () => {
        expect(spokenNumbersToDigits('')).toBe('');
    });
});
