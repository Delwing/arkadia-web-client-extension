import { describe, it, expect } from 'vitest';
import { isBodiless } from '@client/killTracker';

describe('isBodiless', () => {
    it('sees the type past the adjectives in front of it', () => {
        expect(isBodiless('wielki ognisty zywiolak ognia')).toBe(true);
        expect(isBodiless('potezny kamienny zywiolak ziemi')).toBe(true);
        expect(isBodiless('blady przezroczysty duch')).toBe(true);
    });

    it('still matches a bare type', () => {
        expect(isBodiless('zywiolak wody')).toBe(true);
        expect(isBodiless('zjawa')).toBe(true);
    });

    it('matches whole words only', () => {
        expect(isBodiless('ogromny szary troll')).toBe(false);
        expect(isBodiless('duchowny')).toBe(false);
    });
});
