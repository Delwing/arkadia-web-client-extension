import {describe, expect, it} from 'vitest';
import {joinCompoundDirections} from '@web/voice/directions';

describe('joinCompoundDirections', () => {
    it.each([
        ['polnocny zachod', 'polnocny-zachod'],
        ['polnocny wschod', 'polnocny-wschod'],
        ['poludniowy zachod', 'poludniowy-zachod'],
        ['poludniowy wschod', 'poludniowy-wschod'],
    ])('joins %s, which the game only takes hyphenated', (spoken, expected) => {
        expect(joinCompoundDirections(spoken)).toBe(expected);
    });

    it('joins a direction sitting inside a longer command', () => {
        expect(joinCompoundDirections('idz polnocny zachod szybko')).toBe('idz polnocny-zachod szybko');
    });

    it('leaves a plain direction alone', () => {
        expect(joinCompoundDirections('polnoc')).toBe('polnoc');
        expect(joinCompoundDirections('zachod')).toBe('zachod');
    });

    it('leaves an unrelated pair alone', () => {
        expect(joinCompoundDirections('polnocny wiatr')).toBe('polnocny wiatr');
        expect(joinCompoundDirections('zabij zachod')).toBe('zabij zachod');
    });

    it('is a no-op on text that is already hyphenated', () => {
        expect(joinCompoundDirections('polnocny-zachod')).toBe('polnocny-zachod');
    });

    it('handles an empty line', () => {
        expect(joinCompoundDirections('')).toBe('');
    });
});
