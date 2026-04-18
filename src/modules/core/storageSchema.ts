/**
 * Typed storage schemas for character-scoped and global storage keys.
 *
 * Each interface maps localStorage key names to their value types.
 * Keys with unknown/complex shapes use `any` with TODO comments.
 */

import type { Settings } from './defaultSettings';
import type { BindSettings, KeymapStore } from './keymapTypes';
import type { CustomSound } from './customSounds';
import type { UiSettings } from '@web/defaultUiSettings';
import type { LayoutState } from '@web/layout/types';
import type { DesktopButtonsSettings } from '@web/desktopButtonSettings';
import type { Settings as MobileButtonsSettings } from '@web/mobileButtonSettings';
import type { DeviceInfo } from '@modules/device/deviceTypes';
import type { UserTrigger } from '@client/scripts/userTriggers';
import type { UserAlias } from '@client/scripts/userAliases';
import type { ShortcutEntry } from '@client/scripts/shortcuts';
import type { ContractsSnapshot } from '@client/scripts/contracts';
import type { ZlomSnapshot } from '@client/scripts/zlom';
import type { AttackMode } from '@client/utils/attackController';
import type { CharGender } from '@shared/events/gmcpTypes';

/**
 * Character-scoped storage keys.
 * These are prefixed with `<characterName>:` in localStorage.
 */
export interface CharacterStorageSchema {
    settings: Settings;
    kill_counter: Record<string, number>;
    kill_counter_session: Record<string, { mySession: number; teamSession: number }>;
    kill_counter_team: Record<string, Record<string, number>>;
    improve_counter: any;
    improve_counter_lifetime: any;
    deposits: any; // TODO: type when deposits structure is defined
    containers: any; // TODO: type when containers structure is defined
    herb_counts: any; // HerbBagsState
    herbs_data: any; // TODO: type when herbs data structure is defined
    mapperRoomId: number;
    lastLang: string;
    object_num: string;
    clock_active_domain: string;
    language_max_levels: Record<string, number>;
    profession: string;
    introduced_remembered: string[];
    introduced_presented: string[];
    peopleLocalEvents: any; // TODO: type when people local events structure is defined
    lua_gags_delete_lines: any; // TODO: type lua gags delete lines config
    lua_gags_colors: any; // TODO: type lua gags colors config
    lua_gags_walka_config: any; // TODO: type lua gags walka config
    attack_mode: AttackMode;
    chat_history: any[]; // TODO: use serialized ChatEntry[] type
    gender: CharGender;
    zlom: ZlomSnapshot;
}

/**
 * Global (non-character-scoped) storage keys.
 * These are stored directly in localStorage without a character prefix.
 */
export interface GlobalStorageSchema {
    uiSettings: UiSettings;
    binds: BindSettings;
    shortcuts: Record<string, ShortcutEntry>;
    triggers: UserTrigger[];
    aliases: UserAlias[];
    mobileButtonSettings: MobileButtonsSettings;
    desktopButtonSettings: DesktopButtonsSettings;
    scripts: string[];
    stored_scripts: string[];
    loggingEnabled: boolean;
    logFileSaveEnabled: boolean;
    keymaps: KeymapStore;
    active_keymap_id: string;
    currentCharacter: string;
    layoutManagerState: LayoutState;
    deviceInfo: DeviceInfo;
    objectsListPosition: any; // TODO: type position data
    mobileButtonsPosition: any; // TODO: type position data
    settingsMigrationsVersion: number;
    contracts: ContractsSnapshot;
    custom_sounds: CustomSound[];
    last_world_rebirth: number;
}

/**
 * Options that control per-key behavior for character storage.
 */
export interface CharacterStorageKeyOptions {
    /** If true, fire change events even when the new value is null */
    notifyOnNull?: boolean;
    /** Default value to return when no stored value exists */
    defaultValue?: unknown;
}

/**
 * Per-key options for character-scoped keys that need special behavior.
 */
export const CHARACTER_KEY_OPTIONS: Partial<Record<keyof CharacterStorageSchema, CharacterStorageKeyOptions>> = {
    settings: { notifyOnNull: true, defaultValue: undefined }, // defaultSettings applied at read time
    peopleLocalEvents: { notifyOnNull: true },
    attack_mode: { notifyOnNull: true },
    chat_history: { notifyOnNull: true },
    containers: { notifyOnNull: true },
    deposits: { notifyOnNull: true },
    herb_counts: { notifyOnNull: true },
    improve_counter: { notifyOnNull: true },
    improve_counter_lifetime: { notifyOnNull: true },
    introduced_remembered: { notifyOnNull: true },
    kill_counter: { notifyOnNull: true },
    kill_counter_session: { notifyOnNull: true },
    kill_counter_team: { notifyOnNull: true },
    lastLang: { notifyOnNull: true },
    lua_gags_delete_lines: { notifyOnNull: true },
    lua_gags_colors: { notifyOnNull: true },
    lua_gags_walka_config: { notifyOnNull: true },
    profession: { notifyOnNull: true },
};

/** All character-scoped storage keys as a const array for runtime use. */
export const characterStorageKeys = [
    'settings',
    'kill_counter',
    'kill_counter_session',
    'kill_counter_team',
    'improve_counter',
    'improve_counter_lifetime',
    'deposits',
    'containers',
    'herb_counts',
    'herbs_data',
    'mapperRoomId',
    'lastLang',
    'object_num',
    'clock_active_domain',
    'language_max_levels',
    'profession',
    'introduced_remembered',
    'introduced_presented',
    'peopleLocalEvents',
    'lua_gags_delete_lines',
    'lua_gags_colors',
    'lua_gags_walka_config',
    'attack_mode',
    'chat_history',
    'gender',
    'zlom',
] as const satisfies readonly (keyof CharacterStorageSchema)[];

/** All global storage keys as a const array for runtime use. */
export const globalStorageKeys = [
    'uiSettings',
    'binds',
    'shortcuts',
    'triggers',
    'aliases',
    'mobileButtonSettings',
    'desktopButtonSettings',
    'scripts',
    'stored_scripts',
    'loggingEnabled',
    'logFileSaveEnabled',
    'keymaps',
    'active_keymap_id',
    'currentCharacter',
    'layoutManagerState',
    'deviceInfo',
    'objectsListPosition',
    'mobileButtonsPosition',
    'settingsMigrationsVersion',
    'custom_sounds',
    'last_world_rebirth',
] as const satisfies readonly (keyof GlobalStorageSchema)[];
