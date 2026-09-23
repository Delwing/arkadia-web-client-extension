import type { PluginApi } from "../PluginApi";

/**
 * The plugin API sections a script sees by their own name, without `api.`:
 * `command.send(...)`, `map.…`, `team.…`. Shared by the runtime, which unpacks
 * them, and the editor, which declares them for completion.
 *
 * `gmcp` is left out: in a script it is the GMCP data itself (`api.gmcp.get()`
 * taken when the run starts), which is what a script nearly always wants.
 */
export const SCRIPT_API_NAMES = [
    "triggers",
    "aliases",
    "events",
    "map",
    "output",
    "ui",
    "colors",
    "bind",
    "multibinds",
    "team",
    "attackQueue",
    "objects",
    "command",
    "commandHooks",
    "prettyContainers",
    "containers",
    "magics",
    "magicKeys",
    "herbs",
    "objectListFilters",
    "enemyBinds",
    "buttonMacros",
    "triggerMacros",
    "settings",
    "attackController",
    "combat",
    "locationNotes",
    "people",
    "AnsiAwareBuffer",
] as const satisfies readonly (keyof PluginApi)[];
