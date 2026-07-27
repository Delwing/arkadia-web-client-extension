import { beforeEach, describe, expect, test } from 'vitest';
import { globalStorage } from '@modules/core/storage';
import { getLatestMigrationVersion, migrateMobileButtonOverrides } from '@modules/core/settingsMigrations';

beforeEach(() => localStorage.clear());

/** Legacy shape: three full layouts, team/leader duplicating most of solo. */
function legacyStored() {
    return {
        solo: {
            cols: 3,
            background: '#111111',
            order: ['a', 'b', 'c'],
            buttons: {
                a: { macroType: 'command', command: 'polnoc', label: 'N' },
                b: { macroType: 'command', command: 'poludnie', label: 'S' },
                c: { macroType: 'command', command: 'wschod', label: 'E' },
            },
        },
        team: {
            cols: 3,
            background: '#111111',
            order: ['a', 'b', 'c'],
            buttons: {
                a: { macroType: 'command', command: 'polnoc', label: 'N' },
                // only this one differs from solo
                b: { macroType: 'command', command: 'poludnie', label: 'S-team' },
                c: { macroType: 'command', command: 'wschod', label: 'E' },
            },
        },
        leader: {
            cols: 4, // differs from solo
            background: '#111111',
            order: ['a', 'b', 'c'],
            buttons: {
                a: { macroType: 'command', command: 'polnoc', label: 'N' },
                b: { macroType: 'command', command: 'poludnie', label: 'S' },
                c: { macroType: 'command', command: 'wschod', label: 'E' },
            },
        },
        locked: true,
    };
}

describe('migrateMobileButtonOverrides', () => {
    test('collapses team/leader into sparse overrides over the solo base', () => {
        // pre-migration version so the gate opens
        globalStorage.set('settingsMigrationsVersion', 10 as never);
        globalStorage.set('mobileButtonSettings', legacyStored() as never);

        migrateMobileButtonOverrides();

        const next = globalStorage.get('mobileButtonSettings') as Record<string, any>;
        expect(next.format).toBe(2);
        // solo survives whole
        expect(next.solo.order).toEqual(['a', 'b', 'c']);
        expect(next.solo.buttons.b.label).toBe('S');
        expect(next.locked).toBe(true);

        // team keeps only the diverging button, not the whole layout
        expect(next.team.buttons).toHaveProperty('b');
        expect(next.team.buttons.b.label).toBe('S-team');
        expect(next.team.buttons).not.toHaveProperty('a');
        expect(next.team.buttons).not.toHaveProperty('c');
        expect(next.team).not.toHaveProperty('cols');

        // leader diverges only on cols, so it must carry no button overrides
        expect(next.leader.cols).toBe(4);
        expect(next.leader).not.toHaveProperty('buttons');
    });

    test('is a no-op once already converted (format 2)', () => {
        globalStorage.set('settingsMigrationsVersion', 10 as never);
        const converted = { format: 2, solo: { cols: 3, order: ['a'], buttons: { a: { label: 'N' } } }, locked: false };
        globalStorage.set('mobileButtonSettings', converted as never);

        migrateMobileButtonOverrides();

        expect(globalStorage.get('mobileButtonSettings')).toEqual(converted);
    });

    test('does not run once the version gate has passed', () => {
        // the migration is registered as the latest version; a user already at
        // that version must not have their settings rewritten again
        globalStorage.set('settingsMigrationsVersion', getLatestMigrationVersion() as never);
        const legacy = legacyStored();
        globalStorage.set('mobileButtonSettings', legacy as never);

        migrateMobileButtonOverrides();

        expect(globalStorage.get('mobileButtonSettings')).toEqual(legacy);
    });

    test('gate is open for every version below the latest migration', () => {
        // guards against the gate being renumbered out of sync with the
        // migrations registry (this migration is the newest one)
        globalStorage.set('settingsMigrationsVersion', (getLatestMigrationVersion() - 1) as never);
        globalStorage.set('mobileButtonSettings', legacyStored() as never);

        migrateMobileButtonOverrides();

        expect((globalStorage.get('mobileButtonSettings') as Record<string, any>).format).toBe(2);
    });
});
