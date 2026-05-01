import { describe, expect, it, beforeEach } from 'vitest';
import {
    LayoutSettings,
    LayoutOverride,
    Settings,
    createDefaultLayout,
    diffLayout,
    loadSettings,
    resolveLayout,
    saveSettings,
} from '@web/mobileButtonSettings';

beforeEach(() => {
    localStorage.clear();
});

function makeBase(): LayoutSettings {
    return createDefaultLayout();
}

describe('resolveLayout', () => {
    it('returns base when override is null', () => {
        const base = makeBase();
        const resolved = resolveLayout(base, null);
        expect(resolved.cols).toBe(base.cols);
        expect(resolved.background).toBe(base.background);
        expect(resolved.order).toEqual(base.order);
        expect(resolved.buttons).toEqual(base.buttons);
    });

    it('inherits cols and background when override leaves them undefined', () => {
        const base = makeBase();
        const override: LayoutOverride = { buttons: { 'go-button': { color: '#ff0000' } } };
        const resolved = resolveLayout(base, override);
        expect(resolved.cols).toBe(base.cols);
        expect(resolved.background).toBe(base.background);
        expect(resolved.buttons['go-button'].color).toBe('#ff0000');
        // Other fields of go-button preserved from base
        expect(resolved.buttons['go-button'].label).toBe(base.buttons['go-button'].label);
        // Other buttons untouched
        expect(resolved.buttons['n-button']).toEqual(base.buttons['n-button']);
    });

    it('overrides cols and background when set', () => {
        const base = makeBase();
        const override: LayoutOverride = { cols: 6, background: 'rgba(0, 0, 0, 0.5)' };
        const resolved = resolveLayout(base, override);
        expect(resolved.cols).toBe(6);
        expect(resolved.background).toBe('rgba(0, 0, 0, 0.5)');
    });

    it('inherits order cells where override has null', () => {
        const base = makeBase();
        const sparse = base.order.map(() => null) as (string | null)[];
        sparse[0] = 'go-button';
        const override: LayoutOverride = { order: sparse };
        const resolved = resolveLayout(base, override);
        expect(resolved.order[0]).toBe('go-button');
        for (let i = 1; i < base.order.length; i++) {
            expect(resolved.order[i]).toBe(base.order[i]);
        }
    });
});

describe('diffLayout', () => {
    it('returns null when layouts are identical', () => {
        const base = makeBase();
        const same = createDefaultLayout();
        expect(diffLayout(same, base)).toBeNull();
    });

    it('detects a single button field change', () => {
        const base = makeBase();
        const modified: LayoutSettings = {
            ...base,
            buttons: {
                ...base.buttons,
                'go-button': { ...base.buttons['go-button'], color: '#ff0000' },
            },
        };
        const diff = diffLayout(modified, base);
        expect(diff).not.toBeNull();
        expect(diff!.buttons).toBeDefined();
        expect(diff!.buttons!['go-button']).toEqual({ color: '#ff0000' });
        // No other fields should be in the diff
        expect(Object.keys(diff!.buttons!)).toEqual(['go-button']);
    });

    it('detects cols change', () => {
        const base = makeBase();
        const modified: LayoutSettings = { ...base, cols: 6 };
        const diff = diffLayout(modified, base);
        expect(diff).not.toBeNull();
        expect(diff!.cols).toBe(6);
    });

    it('detects background change', () => {
        const base = makeBase();
        const modified: LayoutSettings = { ...base, background: 'rgba(0, 0, 0, 0.5)' };
        const diff = diffLayout(modified, base);
        expect(diff).not.toBeNull();
        expect(diff!.background).toBe('rgba(0, 0, 0, 0.5)');
    });

    it('encodes order diff as sparse array when length matches', () => {
        const base = makeBase();
        const reorderedOrder = [...base.order];
        // Swap first and last
        [reorderedOrder[0], reorderedOrder[reorderedOrder.length - 1]] =
            [reorderedOrder[reorderedOrder.length - 1], reorderedOrder[0]];
        const modified: LayoutSettings = { ...base, order: reorderedOrder };
        const diff = diffLayout(modified, base);
        expect(diff).not.toBeNull();
        expect(diff!.order).toBeDefined();
        expect(diff!.order!.length).toBe(base.order.length);
        // Middle cells unchanged → null
        for (let i = 1; i < base.order.length - 1; i++) {
            expect(diff!.order![i]).toBeNull();
        }
        expect(diff!.order![0]).toBe(reorderedOrder[0]);
    });

    it('captures prepended rows as `prepend` and keeps base region inherited', () => {
        const base = makeBase();
        const prependIds = ['x1', 'x2', 'x3', 'x4'];
        const modified: LayoutSettings = {
            ...base,
            buttons: {
                ...base.buttons,
                x1: { macroType: 'command', label: 'X1', color: '#fff', command: 'x1' },
                x2: { macroType: 'command', label: 'X2', color: '#fff', command: 'x2' },
                x3: { macroType: 'command', label: 'X3', color: '#fff', command: 'x3' },
                x4: { macroType: 'command', label: 'X4', color: '#fff', command: 'x4' },
            },
            order: [...prependIds, ...base.order],
        };
        const diff = diffLayout(modified, base);
        expect(diff).not.toBeNull();
        expect(diff!.prepend).toEqual(prependIds);
        expect(diff!.append).toBeUndefined();
        expect(diff!.order).toBeUndefined();
        // No base buttons should appear in the override.buttons
        expect(diff!.buttons && Object.keys(diff!.buttons).every(k => prependIds.includes(k))).toBe(true);
    });

    it('captures appended rows as `append`', () => {
        const base = makeBase();
        const appendIds = ['y1', 'y2', 'y3', 'y4'];
        const modified: LayoutSettings = {
            ...base,
            buttons: {
                ...base.buttons,
                y1: { macroType: 'command', label: 'Y1', color: '#fff', command: 'y1' },
                y2: { macroType: 'command', label: 'Y2', color: '#fff', command: 'y2' },
                y3: { macroType: 'command', label: 'Y3', color: '#fff', command: 'y3' },
                y4: { macroType: 'command', label: 'Y4', color: '#fff', command: 'y4' },
            },
            order: [...base.order, ...appendIds],
        };
        const diff = diffLayout(modified, base);
        expect(diff).not.toBeNull();
        expect(diff!.append).toEqual(appendIds);
        expect(diff!.prepend).toBeUndefined();
        expect(diff!.order).toBeUndefined();
    });
});

describe('save/load round-trip', () => {
    it('round-trips a settings object with no overrides', () => {
        const base = createDefaultLayout();
        const settings: Settings = {
            solo: base,
            team: createDefaultLayout(),
            leader: createDefaultLayout(),
            locked: false,
            radial: { enabled: true, commands: [] },
            buttonSize: 36,
            buttonGap: 10,
        };
        saveSettings(settings);
        const stored: any = JSON.parse(localStorage.getItem('mobileButtonSettings')!);
        // No overrides should be persisted
        expect(stored.team).toBeUndefined();
        expect(stored.leader).toBeUndefined();
        expect(stored.format).toBe(2);
        const reloaded = loadSettings();
        expect(reloaded.team.buttons['go-button']).toEqual(base.buttons['go-button']);
        expect(reloaded.leader.cols).toBe(base.cols);
    });

    it('round-trips a settings object with a team override', () => {
        const base = createDefaultLayout();
        const team: LayoutSettings = {
            ...base,
            buttons: {
                ...base.buttons,
                'go-button': { ...base.buttons['go-button'], color: '#ff0000', label: 'GO!' },
            },
        };
        const settings: Settings = {
            solo: base,
            team,
            leader: createDefaultLayout(),
            locked: false,
            radial: { enabled: true, commands: [] },
            buttonSize: 36,
            buttonGap: 10,
        };
        saveSettings(settings);
        const stored: any = JSON.parse(localStorage.getItem('mobileButtonSettings')!);
        expect(stored.team).toBeDefined();
        expect(stored.team.buttons['go-button']).toEqual({ color: '#ff0000', label: 'GO!' });
        // Solo (base) saved fully
        expect(stored.solo.buttons['go-button'].color).toBe(base.buttons['go-button'].color);

        const reloaded = loadSettings();
        expect(reloaded.team.buttons['go-button'].color).toBe('#ff0000');
        expect(reloaded.team.buttons['go-button'].label).toBe('GO!');
        // Other fields inherited
        expect(reloaded.team.buttons['go-button'].command).toBe(base.buttons['go-button'].command);
    });

    it('prepended row preserves inheritance for base cells after reload', () => {
        const base = createDefaultLayout();
        const prependIds = ['x1', 'x2', 'x3', 'x4'];
        const team: LayoutSettings = {
            ...base,
            buttons: {
                ...base.buttons,
                x1: { macroType: 'command', label: 'X1', color: '#fff', command: 'x1' },
                x2: { macroType: 'command', label: 'X2', color: '#fff', command: 'x2' },
                x3: { macroType: 'command', label: 'X3', color: '#fff', command: 'x3' },
                x4: { macroType: 'command', label: 'X4', color: '#fff', command: 'x4' },
            },
            order: [...prependIds, ...base.order],
        };
        const settings: Settings = {
            solo: base,
            team,
            leader: createDefaultLayout(),
            locked: false,
            radial: { enabled: true, commands: [] },
        };
        saveSettings(settings);
        const stored: any = JSON.parse(localStorage.getItem('mobileButtonSettings')!);
        expect(stored.team.prepend).toEqual(prependIds);
        // The base region should NOT be stored: only the prepend cells are.
        expect(stored.team.order).toBeUndefined();

        // User changes a base button color afterwards
        const newBase: LayoutSettings = {
            ...base,
            buttons: {
                ...base.buttons,
                'go-button': { ...base.buttons['go-button'], color: '#ff00ff' },
            },
        };
        // Mirror the change in the runtime team layout (would happen naturally since buttons are inherited at load)
        const updatedTeam: LayoutSettings = {
            ...team,
            buttons: {
                ...team.buttons,
                'go-button': { ...team.buttons['go-button'], color: '#ff00ff' },
            },
        };
        saveSettings({ ...settings, solo: newBase, team: updatedTeam });

        const reloaded = loadSettings();
        // Team's go-button (from inherited base region) should reflect the new base color
        expect(reloaded.team.buttons['go-button'].color).toBe('#ff00ff');
        // Prepended cells still present
        expect(reloaded.team.order.slice(0, 4)).toEqual(prependIds);
        // Base region intact in resolved order
        expect(reloaded.team.order.slice(4)).toEqual(newBase.order);
    });

    it('changes to base propagate to inherited team buttons after reload', () => {
        const base = createDefaultLayout();
        // Team only overrides label of go-button
        const team: LayoutSettings = {
            ...base,
            buttons: {
                ...base.buttons,
                'go-button': { ...base.buttons['go-button'], label: 'TEAM-GO' },
            },
        };
        const settings: Settings = {
            solo: base,
            team,
            leader: createDefaultLayout(),
            locked: false,
            radial: { enabled: true, commands: [] },
        };
        saveSettings(settings);

        // User edits base color afterwards
        const newBase: LayoutSettings = {
            ...base,
            buttons: {
                ...base.buttons,
                'go-button': { ...base.buttons['go-button'], color: '#abcdef' },
            },
        };
        const updated: Settings = { ...settings, solo: newBase, team: { ...team, buttons: { ...team.buttons, 'go-button': { ...team.buttons['go-button'], color: '#abcdef' } } } };
        saveSettings(updated);

        const reloaded = loadSettings();
        // Team should have new base color (via inheritance) and its own label
        expect(reloaded.team.buttons['go-button'].color).toBe('#abcdef');
        expect(reloaded.team.buttons['go-button'].label).toBe('TEAM-GO');
    });
});
