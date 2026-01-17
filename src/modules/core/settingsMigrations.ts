import type { Settings, CollectOverride } from './defaultSettings';
import storage from './storage';
import type { FooterComponentConfig } from '@web/defaultUiSettings';

const MIGRATIONS_VERSION_KEY = 'settingsMigrationsVersion';

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
];

/**
 * Get the current migrations version from storage.
 */
function getMigrationsVersion(): number {
    const stored = localStorage.getItem(MIGRATIONS_VERSION_KEY);
    if (stored === null) {
        return 0;
    }
    const version = parseInt(stored, 10);
    return isNaN(version) ? 0 : version;
}

/**
 * Set the migrations version in storage.
 */
function setMigrationsVersion(version: number): void {
    localStorage.setItem(MIGRATIONS_VERSION_KEY, String(version));
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
export async function migrateButtonSizeMultiplier(): Promise<void> {
    const currentVersion = getMigrationsVersion();

    // This is migration version 3
    if (currentVersion >= 3) {
        return;
    }

    try {
        // Load uiSettings to get the multiplier
        const uiData = await storage.getItem('uiSettings');
        const multiplier = uiData?.uiSettings?.buttonSize;

        // Only migrate if multiplier exists and is different from default (1)
        if (typeof multiplier === 'number' && multiplier > 0 && multiplier !== 1) {
            // Load mobileButtonSettings
            const mobileData = await storage.getItem('mobileButtonSettings');
            const mobileSettings = mobileData?.mobileButtonSettings || {};

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
                await storage.setItem('mobileButtonSettings', mobileSettings);
                console.log(`[SettingsMigrations] Migrated buttonSize multiplier ${multiplier} to buttonSize=${mobileSettings.buttonSize}px, buttonGap=${mobileSettings.buttonGap}px`);
            }

            // Remove buttonSize from uiSettings
            if (uiData?.uiSettings) {
                delete uiData.uiSettings.buttonSize;
                await storage.setItem('uiSettings', uiData.uiSettings);
                console.log('[SettingsMigrations] Removed buttonSize multiplier from uiSettings');
            }
        }
    } catch (e) {
        console.error('[SettingsMigrations] Failed to migrate buttonSize multiplier:', e);
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
        const uiData = await storage.getItem('uiSettings');
        const uiSettings = uiData?.uiSettings;

        if (!uiSettings) {
            return;
        }

        const showTransportLabel = uiSettings.showTransportLabel;
        const showCombatTimer = uiSettings.showCombatTimer;
        const showClockDisplay = uiSettings.showClockDisplay;

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
        let footerComponents: FooterComponentConfig[] = uiSettings.footerComponents;
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
            uiSettings.footerComponents = footerComponents;

            // Remove old settings
            delete uiSettings.showTransportLabel;
            delete uiSettings.showCombatTimer;
            delete uiSettings.showClockDisplay;

            await storage.setItem('uiSettings', uiSettings);
            console.log('[SettingsMigrations] Migrated footer component visibility settings');
        }
    } catch (e) {
        console.error('[SettingsMigrations] Failed to migrate footer component visibility:', e);
    }
}
