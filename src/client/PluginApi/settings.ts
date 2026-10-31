import type { Settings } from "@modules/core/defaultSettings";
import { defaultSettings } from "@modules/core/defaultSettings";
import { characterStorage, globalStorage } from "@modules/core/storage";
import type { UiSettings } from "@client/ports";
import { getPluginHostPort } from "@client/ports";
import { getShellSettings, getRenderSettings, getMapSettings, getBehaviorSettings } from "@modules/core/settings";

/**
 * Settings API - Access character and UI settings
 *
 * Provides read-only access to character settings (scoped to current character)
 * and UI settings (global).
 */
export interface SettingsApi {
  /**
   * Get all character settings
   * @returns Current character settings merged with defaults
   *
   * @example
   * ```typescript
   * const settings = await api.settings.getCharacterSettings();
   * console.log(`Attack command: ${settings.attackCommand}`);
   * console.log(`Guilds: ${settings.guilds?.join(", ")}`);
   * ```
   */
  getCharacterSettings(): Promise<Settings>;

  /**
   * Get a specific character setting
   * @param key - Setting key (e.g., "attackCommand", "guilds", "collectMode")
   * @returns The value of the setting
   *
   * @example
   * ```typescript
   * const guilds = await api.settings.getCharacterSetting("guilds");
   * const attackCommand = await api.settings.getCharacterSetting("attackCommand");
   * ```
   */
  getCharacterSetting<K extends keyof Settings>(key: K): Promise<Settings[K]>;

  /**
   * Get all UI settings
   * @returns Current UI settings merged with defaults
   *
   * @example
   * ```typescript
   * const uiSettings = await api.settings.getUiSettings();
   * console.log(`Font size: ${uiSettings.contentFontSize}`);
   * console.log(`Map position: ${uiSettings.mapPosition}`);
   * ```
   */
  getUiSettings(): Promise<UiSettings>;

  /**
   * Get a specific UI setting
   * @param key - Setting key (e.g., "contentFontSize", "mapPosition", "showButtons")
   * @returns The value of the setting
   *
   * @example
   * ```typescript
   * const fontSize = await api.settings.getUiSetting("contentFontSize");
   * const mapPosition = await api.settings.getUiSetting("mapPosition");
   * ```
   */
  getUiSetting<K extends keyof UiSettings>(key: K): Promise<UiSettings[K]>;
}

export function createSettingsApi(): SettingsApi {
  const api: SettingsApi = {
    getCharacterSettings: async (): Promise<Settings> => {
      const stored = characterStorage.get("settings");
      return { ...defaultSettings, ...stored };
    },

    getCharacterSetting: async <K extends keyof Settings>(key: K): Promise<Settings[K]> => {
      const settings = await api.getCharacterSettings();
      return settings[key];
    },

    getUiSettings: async (): Promise<UiSettings> => {
      // Compose the unified view from the concern slices (which hold the moved
      // fields) plus the uiSettings blob (stock chrome), so plugins see the
      // full settings shape regardless of the physical storage split.
      return {
        ...getPluginHostPort().getDefaultUiSettings(),
        ...getShellSettings(),
        ...getRenderSettings(),
        ...getMapSettings(),
        ...getBehaviorSettings(),
        ...(globalStorage.get("uiSettings") ?? {}),
      };
    },

    getUiSetting: async <K extends keyof UiSettings>(key: K): Promise<UiSettings[K]> => {
      const uiSettings = await api.getUiSettings();
      return uiSettings[key];
    }
  };
  return api;
}
