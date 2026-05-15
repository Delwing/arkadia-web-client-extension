import type { Settings, CollectOverride } from './defaultSettings';
import { globalStorage } from './storage';
import type { FooterComponentConfig } from '@web/defaultUiSettings';

interface Migration {
    version: number;
    description: string;
    migrate: (settings: Partial<Settings>) => Partial<Settings>;
}

/**
 * Settings migrations registry.
 * Each migration has a version number and transforms settings from the previous version.
 * Migrations are applied in order, starting from the stored version.
 */
// Map of accusative -> nominative forms for enemy names
const accusativeToNominative: Record<string, string> = {
    'trolla': 'troll',
    'bykocentaura': 'bykocentaur',
    'ghoula': 'ghoul',
    'grzyboczleka': 'grzyboczlek',
    'bagiennika': 'bagiennik',
    'zjawe': 'zjawa',
    'wyverne': 'wywerna',
    'harpie': 'harpia',
};

function migrateAccusativeToNominative(settings: Partial<Settings>): Partial<Settings> {
    if (!settings.collectOverrides) {
        return settings;
    }

    const migratedOverrides: CollectOverride[] = settings.collectOverrides.map(override => {
        const lowerEnemy = override.enemy.toLowerCase();
        const nominative = accusativeToNominative[lowerEnemy];
        if (nominative) {
            return { ...override, enemy: nominative };
        }
        return override;
    });

    return { ...settings, collectOverrides: migratedOverrides };
}

const migrations: Migration[] = [
    {
        version: 1,
        description: 'Convert collectOverrides enemy names from accusative to nominative Polish forms',
        migrate: migrateAccusativeToNominative,
    },
    {
        version: 2,
        description: 'Re-run accusative to nominative conversion (fix for multi-character migration bug)',
        migrate: migrateAccusativeToNominative,
    },
    {
        version: 3,
        description: 'Migrate buttonSize multiplier from uiSettings to mobileButtonSettings (handled by migrateButtonSizeMultiplier)',
        migrate: settings => settings, // No-op for core Settings, actual migration is async
    },
    {
        version: 4,
        description: 'Migrate showTransportLabel/showCombatTimer/showClockDisplay to footerComponents (handled by migrateFooterComponentVisibility)',
        migrate: settings => settings, // No-op for core Settings, actual migration is async
    },
    {
        version: 5,
        description: 'Convert inlineCompassRose from boolean to number (0=off, 1=inline, 2=box)',
        migrate: (settings) => {
            if (typeof settings.inlineCompassRose === 'boolean') {
                return { ...settings, inlineCompassRose: settings.inlineCompassRose ? 1 : 0 };
            }
            return settings;
        },
    },
    {
        version: 6,
        description: 'Rename macro to macroType in mobileButtonSettings (handled by migrateMobileButtonMacroField)',
        migrate: settings => settings,
    },
    {
        version: 7,
        description: 'Rename guild color key PE to BK',
        migrate: (settings) => {
            if (settings.guildColors && 'PE' in settings.guildColors) {
                const { PE, ...rest } = settings.guildColors;
                return { ...settings, guildColors: { ...rest, BK: PE } };
            }
            return settings;
        },
    },
    {
        version: 8,
        description: 'Migrate layoutManagerState from nested-slots to flat windows (handled by migrateLayoutManagerState)',
        migrate: settings => settings, // No-op for core Settings, actual migration is below
    },
];

/**
 * Get the current migrations version from storage.
 */
function getMigrationsVersion(): number {
    const version = globalStorage.get('settingsMigrationsVersion');
    return typeof version === 'number' && !isNaN(version) ? version : 0;
}

/**
 * Set the migrations version in storage.
 */
function setMigrationsVersion(version: number): void {
    globalStorage.set('settingsMigrationsVersion', version);
}

/**
 * Get the latest migration version.
 */
export function getLatestMigrationVersion(): number {
    return migrations.length > 0 ? migrations[migrations.length - 1].version : 0;
}

/**
 * Apply pending migrations to settings.
 * Returns the migrated settings and whether any migrations were applied.
 * Note: This function does NOT update the stored migration version - callers must do that.
 */
export function migrateSettings(settings: Partial<Settings>, fromVersion?: number): { settings: Partial<Settings>; migrated: boolean } {
    const currentVersion = fromVersion ?? getMigrationsVersion();
    const latestVersion = getLatestMigrationVersion();

    if (currentVersion >= latestVersion) {
        return { settings, migrated: false };
    }

    let migratedSettings = { ...settings };
    let appliedCount = 0;

    for (const migration of migrations) {
        if (migration.version > currentVersion) {
            console.log(`[SettingsMigrations] Applying migration v${migration.version}: ${migration.description}`);
            migratedSettings = migration.migrate(migratedSettings);
            appliedCount++;
        }
    }

    if (appliedCount > 0) {
        console.log(`[SettingsMigrations] Applied ${appliedCount} migration(s)`);
    }

    return { settings: migratedSettings, migrated: appliedCount > 0 };
}

/**
 * Run migrations for a specific character's settings.
 * Call this when loading settings from storage.
 */
export function runSettingsMigrations(characterKey: string | null): void {
    const currentVersion = getMigrationsVersion();
    const latestVersion = getLatestMigrationVersion();

    if (currentVersion >= latestVersion) {
        return;
    }

    const settingsKey = characterKey ? `${characterKey}:settings` : 'settings';
    const raw = localStorage.getItem(settingsKey);

    if (!raw) {
        // No settings stored, nothing to migrate
        // But still update version so new users don't get migration logs
        setMigrationsVersion(latestVersion);
        return;
    }

    try {
        const settings = JSON.parse(raw) as Partial<Settings>;
        const { settings: migrated, migrated: didMigrate } = migrateSettings(settings, currentVersion);

        if (didMigrate) {
            localStorage.setItem(settingsKey, JSON.stringify(migrated));
        }
        setMigrationsVersion(latestVersion);
    } catch (e) {
        console.error('[SettingsMigrations] Failed to parse settings for migration:', e);
    }
}

/**
 * Run migrations for all character settings found in localStorage.
 */
export function runAllSettingsMigrations(): void {
    const currentVersion = getMigrationsVersion();
    const latestVersion = getLatestMigrationVersion();

    if (currentVersion >= latestVersion) {
        return;
    }

    // Find all settings keys (both scoped and unscoped)
    const settingsKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key === 'settings' || key.endsWith(':settings'))) {
            settingsKeys.push(key);
        }
    }

    for (const settingsKey of settingsKeys) {
        const raw = localStorage.getItem(settingsKey);
        if (!raw) continue;

        try {
            const settings = JSON.parse(raw) as Partial<Settings>;
            const { settings: migrated, migrated: didMigrate } = migrateSettings(settings, currentVersion);

            if (didMigrate) {
                localStorage.setItem(settingsKey, JSON.stringify(migrated));
                console.log(`[SettingsMigrations] Migrated settings for: ${settingsKey}`);
            }
        } catch (e) {
            console.error(`[SettingsMigrations] Failed to migrate ${settingsKey}:`, e);
        }
    }

    setMigrationsVersion(latestVersion);
}

/**
 * Migrate buttonSize multiplier from uiSettings to mobileButtonSettings.
 * This is migration version 3 that converts the old multiplier (default 1)
 * to explicit pixel values for buttonSize and buttonGap.
 */
export function migrateButtonSizeMultiplier(): void {
    const currentVersion = getMigrationsVersion();

    // This is migration version 3
    if (currentVersion >= 3) {
        return;
    }

    try {
        // Load uiSettings to get the multiplier
        const uiSettings = globalStorage.get('uiSettings');
        const multiplier = (uiSettings as any)?.buttonSize;

        // Only migrate if multiplier exists and is different from default (1)
        if (typeof multiplier === 'number' && multiplier > 0 && multiplier !== 1) {
            // Load mobileButtonSettings
            const mobileSettings: any = globalStorage.get('mobileButtonSettings') || {};

            // Only migrate if buttonSize/buttonGap not already set
            if (mobileSettings.buttonSize === undefined || mobileSettings.buttonGap === undefined) {
                const defaultButtonSize = 36;
                const defaultButtonGap = 10;

                if (mobileSettings.buttonSize === undefined) {
                    mobileSettings.buttonSize = Math.round(defaultButtonSize * multiplier);
                }
                if (mobileSettings.buttonGap === undefined) {
                    mobileSettings.buttonGap = Math.round(defaultButtonGap * multiplier);
                }

                // Save migrated mobileButtonSettings
                globalStorage.set('mobileButtonSettings', mobileSettings);
                console.log(`[SettingsMigrations] Migrated buttonSize multiplier ${multiplier} to buttonSize=${mobileSettings.buttonSize}px, buttonGap=${mobileSettings.buttonGap}px`);
            }

            // Remove buttonSize from uiSettings
            if (uiSettings) {
                delete (uiSettings as any).buttonSize;
                globalStorage.set('uiSettings', uiSettings);
                console.log('[SettingsMigrations] Removed buttonSize multiplier from uiSettings');
            }
        }
    } catch (e) {
        console.error('[SettingsMigrations] Failed to migrate buttonSize multiplier:', e);
    }
}

/**
 * Rename `macro` to `macroType` in mobileButtonSettings.
 * This is migration version 6 that converts the old field name used in
 * mobile button configs to the unified `macroType` field.
 */
export function migrateMobileButtonMacroField(): void {
    const currentVersion = getMigrationsVersion();

    // This is migration version 6
    if (currentVersion >= 6) {
        return;
    }

    try {
        const raw: any = globalStorage.get('mobileButtonSettings');
        if (!raw || typeof raw !== 'object') {
            return;
        }

        let changed = false;

        function renameMacroInConfig(obj: any): void {
            if (!obj || typeof obj !== 'object') return;
            if ('macro' in obj && !('macroType' in obj)) {
                obj.macroType = obj.macro;
                delete obj.macro;
                changed = true;
            }
            // Recurse into hold config
            if (obj.hold && typeof obj.hold === 'object') {
                renameMacroInConfig(obj.hold);
            }
            // Recurse into steps array
            if (Array.isArray(obj.steps)) {
                for (const step of obj.steps) {
                    renameMacroInConfig(step);
                }
            }
            // Recurse into hold.steps
            if (obj.hold && Array.isArray(obj.hold.steps)) {
                for (const step of obj.hold.steps) {
                    renameMacroInConfig(step);
                }
            }
        }

        // Process each layout (solo, team, leader)
        for (const mode of ['solo', 'team', 'leader']) {
            const layout = raw[mode];
            if (!layout || typeof layout !== 'object') continue;
            const buttons = layout.buttons || layout;
            if (typeof buttons !== 'object') continue;
            for (const key of Object.keys(buttons)) {
                if (['order', 'cols', 'background'].includes(key)) continue;
                const btn = buttons[key];
                if (btn && typeof btn === 'object') {
                    renameMacroInConfig(btn);
                }
            }
        }

        // Also handle legacy flat format (no solo/team/leader wrapper)
        if (!raw.solo && !raw.team && !raw.leader) {
            for (const key of Object.keys(raw)) {
                if (['order', 'cols', 'background', 'locked', 'radial', 'buttonSize', 'buttonGap'].includes(key)) continue;
                const btn = raw[key];
                if (btn && typeof btn === 'object' && ('macro' in btn || 'macroType' in btn)) {
                    renameMacroInConfig(btn);
                }
            }
        }

        if (changed) {
            globalStorage.set('mobileButtonSettings', raw);
            console.log('[SettingsMigrations] Renamed macro to macroType in mobileButtonSettings');
        }
    } catch (e) {
        console.error('[SettingsMigrations] Failed to migrate mobileButtonSettings macro field:', e);
    }
}

/**
 * Migrate the persisted layoutManagerState from the nested-slots shape
 * (docks.{side}.slots[].panels[] + floatingPanels[]) to the flat-windows
 * shape (windows: Record<id, WindowRecord>). Pre-version-8 data uses the
 * old shape; the new components require the flat shape.
 */
export async function migrateLayoutManagerState(): Promise<void> {
    const currentVersion = getMigrationsVersion();

    // This is migration version 8
    if (currentVersion >= 8) {
        return;
    }

    try {
        const raw = localStorage.getItem('layoutManagerState');
        if (!raw) return;

        const stored = JSON.parse(raw);

        // Already in new shape — nothing to do.
        if (stored && typeof stored === 'object' && 'windows' in stored && typeof stored.windows === 'object') {
            return;
        }

        // Dynamic import keeps this module's load time independent of the
        // layout module (which pulls in eventBus, react-bootstrap, etc.).
        const { migrateLayoutState } = await import('@web/layout/utils/layoutStorage');
        const migrated = migrateLayoutState(stored);
        localStorage.setItem('layoutManagerState', JSON.stringify(migrated));
        console.log('[SettingsMigrations] Migrated layoutManagerState to flat-windows shape');
    } catch (e) {
        console.error('[SettingsMigrations] Failed to migrate layoutManagerState:', e);
    }
}

/**
 * Migrate showTransportLabel, showCombatTimer, showClockDisplay to footerComponents.
 * This is migration version 4 that converts the old boolean visibility settings
 * to the new footerComponents array visibility flags.
 */
export async function migrateFooterComponentVisibility(): Promise<void> {
    const currentVersion = getMigrationsVersion();

    // This is migration version 4
    if (currentVersion >= 4) {
        return;
    }

    try {
        const uiSettings = globalStorage.get('uiSettings');

        if (!uiSettings) {
            return;
        }

        const showTransportLabel = (uiSettings as any).showTransportLabel;
        const showCombatTimer = (uiSettings as any).showCombatTimer;
        const showClockDisplay = (uiSettings as any).showClockDisplay;

        // Only migrate if any of the old settings are explicitly set to false
        const needsMigration =
            showTransportLabel === false ||
            showCombatTimer === false ||
            showClockDisplay === false;

        if (!needsMigration) {
            return;
        }

        // Map old settings to footer component IDs
        const visibilityMap: Record<string, boolean | undefined> = {
            'transport-timer': showTransportLabel,
            'combat-timer': showCombatTimer,
            'clock-display': showClockDisplay,
        };

        // Get or create footerComponents
        let footerComponents: FooterComponentConfig[] = (uiSettings as any).footerComponents;
        if (!Array.isArray(footerComponents)) {
            // Use default footer components if not present
            const { defaultFooterComponents } = await import('@web/defaultUiSettings');
            footerComponents = defaultFooterComponents.map((c: FooterComponentConfig) => ({ ...c }));
        }

        // Apply visibility from old settings
        let migrated = false;
        for (const config of footerComponents) {
            const oldVisibility = visibilityMap[config.id];
            if (oldVisibility === false) {
                config.visible = false;
                migrated = true;
            }
        }

        if (migrated) {
            // Save updated footerComponents
            (uiSettings as any).footerComponents = footerComponents;

            // Remove old settings
            delete (uiSettings as any).showTransportLabel;
            delete (uiSettings as any).showCombatTimer;
            delete (uiSettings as any).showClockDisplay;

            globalStorage.set('uiSettings', uiSettings);
            console.log('[SettingsMigrations] Migrated footer component visibility settings');
        }
    } catch (e) {
        console.error('[SettingsMigrations] Failed to migrate footer component visibility:', e);
    }
}
