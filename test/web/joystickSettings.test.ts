import { describe, expect, it } from 'vitest';
import {
    JOYSTICK_MAX_SIZE,
    JOYSTICK_MIN_SIZE,
    createDefaultJoysticks,
    joystickMacro,
    parseJoystickSettings,
    pickJoystickDirection,
} from '@web/joystickSettings.ts';

const COMPASS = { n: 'n', ne: 'ne', e: 'e', se: 'se', s: 's', sw: 'sw', w: 'w', nw: 'nw' };

describe('parseJoystickSettings', () => {
    it('falls back to disabled defaults when nothing is stored', () => {
        const parsed = parseJoystickSettings(undefined);
        expect(parsed.enabled).toBe(false);
        expect(parsed.items.length).toBe(2);
        expect(parsed).toEqual(createDefaultJoysticks());
    });

    it('keeps an emptied list empty', () => {
        expect(parseJoystickSettings({ enabled: true, items: [] })).toEqual({ enabled: true, items: [] });
    });

    it('trims commands, drops empty ones and clamps the size', () => {
        const parsed = parseJoystickSettings({
            enabled: true,
            items: [
                { id: 'a', label: ' x ', center: ' zerknij ', commands: { n: ' u ', s: '', bogus: 'y' }, size: 9999 },
                { id: 'a', commands: {}, size: 1 },
                null,
            ],
        });
        expect(parsed.items).toHaveLength(2);
        expect(parsed.items[0]).toMatchObject({ id: 'a', label: 'x', center: 'zerknij', commands: { n: 'u' }, size: JOYSTICK_MAX_SIZE });
        expect(parsed.items[1].id).not.toBe('a');
        expect(parsed.items[1].size).toBe(JOYSTICK_MIN_SIZE);
    });
});

describe('pickJoystickDirection', () => {
    it('picks nothing inside the dead zone', () => {
        expect(pickJoystickDirection(5, 5, 20, COMPASS)).toBeNull();
    });

    it('maps screen swipes to compass directions', () => {
        expect(pickJoystickDirection(0, -50, 20, COMPASS)).toBe('n');
        expect(pickJoystickDirection(50, 0, 20, COMPASS)).toBe('e');
        expect(pickJoystickDirection(0, 50, 20, COMPASS)).toBe('s');
        expect(pickJoystickDirection(-40, -40, 20, COMPASS)).toBe('nw');
        expect(pickJoystickDirection(40, 40, 20, COMPASS)).toBe('se');
    });

    it('gives each of four directions a quarter of the circle', () => {
        const four = { n: 'u', e: 'wyjdz', s: 'd', w: 'wejdz' };
        expect(pickJoystickDirection(30, -40, 20, four)).toBe('n');
        expect(pickJoystickDirection(40, -30, 20, four)).toBe('e');
    });

    it('ignores swipes pointing away from every configured direction', () => {
        expect(pickJoystickDirection(0, 50, 20, { n: 'u' })).toBeNull();
        expect(pickJoystickDirection(10, -50, 20, { n: 'u' })).toBe('n');
    });
});

describe('joystickMacro', () => {
    it('recognises the built-in actions and nothing else', () => {
        expect(joystickMacro('@zerknij')?.macroType).toBe('zerknij');
        expect(joystickMacro(' @Wyjscie ')?.macroType).toBe('specialExit');
        expect(joystickMacro('@wyjscie2')).toMatchObject({ macroType: 'specialExit', exitIndex: 1 });
        expect(joystickMacro('@wyjscie3')).toMatchObject({ macroType: 'specialExit', exitIndex: 2 });
        expect(joystickMacro('zerknij')).toBeNull();
        expect(joystickMacro('@cokolwiek')).toBeNull();
    });

    it('puts the special exit left and zerknij right on the small default joystick', () => {
        const small = createDefaultJoysticks().items[1];
        expect(small.commands).toEqual({ n: 'u', s: 'd', w: '@wyjscie', e: '@zerknij' });
    });
});
