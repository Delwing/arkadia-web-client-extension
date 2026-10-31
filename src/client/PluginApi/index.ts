/**
 * Plugin API - Bridge between Client and Plugins
 *
 * Provides a stable, versioned API surface for external plugins.
 * This abstraction layer:
 * - Hides internal Client implementation details
 * - Provides a controlled interface for plugin capabilities
 * - Makes it easier to maintain backward compatibility
 *
 * One file per API domain, each with its types and its factory. Every type
 * exported from here is published in @arkadia/plugin-types, together with
 * everything it references (plugins/types/generate-types.cjs).
 */
export { PluginApiImpl } from "./PluginApiImpl";

export type * from "./PluginApi";
export type * from "./aliases";
export type * from "./binds";
export type * from "./combat";
export type * from "./command";
export type * from "./containers";
export type * from "./events";
export type * from "./gmcp";
export type * from "./herbs";
export type * from "./keys";
export type * from "./locationNotes";
export type * from "./macros";
export type * from "./magics";
export type * from "./map";
export type * from "./notifications";
export type * from "./objects";
export type * from "./output";
export type * from "./people";
export type * from "./settings";
export type * from "./sqlite";
export type * from "./storage";
export type * from "./triggers";
export type * from "./walkModes";
export type * from "./ui/chrome";
export type * from "./ui/index";
export type * from "./ui/kit";
export type * from "./ui/popups";

// The plugin module itself
export type { Plugin, PluginInfo } from "@shared/types/Plugin";

// Types the API hands out that live with their features
export type {
  ObjectListEntryFilter,
  EntryContext,
  FilterResult,
  EntryStyle,
  EntryContent,
  ObjectListObject,
} from "@modules/core/objectListFilters";
export type { EnemyBindCandidate, EnemyBindLocationObject, EnemyBindResolver } from "@client/scripts/enemyBindResolvers";
export type { RoomChange, ApplyChangesOptions, MapAreaData } from "@shared/map/MapHelper.ts";
export type {
  MacroConfigField,
  MacroState,
  MacroStateContext,
  ButtonMacroClickContext,
} from "@modules/core/pluginButtonMacroRegistry";
export type { TriggerMacroContext } from "@modules/core/pluginTriggerMacroRegistry";
export type { MobileButtonSetting } from "@web/buttonSettings";
export type { PluginLocationNote } from "@modules/core/pluginLocationNotesRegistry";
export type { PersonListEntry } from "@modules/data/peopleLoader";
export type { CommandHookCallback } from "@client/Client";
export type {
  Trigger,
  TriggerCallback,
  TriggerMatchFunction,
  TriggerOptions,
  TriggerPattern,
  TriggerSubPattern,
} from "@client/Triggers";
export type { AnsiAwareBuffer, BufferSegment, FormatColor, FormatStateSnapshot, TextRange } from "@client/ansi/FormatState";
export type { ObjectData } from "@shared/events";
