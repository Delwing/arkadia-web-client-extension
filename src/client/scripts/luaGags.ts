import Triggers, {Trigger} from "../Triggers";
import type { SoundCategory } from '@shared/events/clientEvents.ts';
import gagsData from "./gags_lua.json";
import {colorString, createColorFormat, mudletColorLine} from "@modules/core/Colors";
import {AnsiAwareBuffer, FormatStateSnapshot} from "../ansi/FormatState";

import * as luainjs from 'lua-in-js'
import {Table} from 'lua-in-js'
import {gmcp} from "../gmcp";

import mudletColors from "../colors.json"
import {LuaType} from "lua-in-js/dist/types/utils";
import Client from "../Client";
import {characterStorage} from "@modules/core/storage";
import {
    DEFAULT_LUA_GAGS_DELETE_LINES,
    DEFAULT_LUA_GAGS_WALKA_CONFIG,
    LUA_GAG_LINE_TYPES,
    LUA_GAGS_STORAGE_KEY,
    LUA_GAGS_COLORS_STORAGE_KEY,
    LUA_GAGS_WALKA_CONFIG_STORAGE_KEY,
    LuaGagDeleteMode,
    LuaGagsWalkaConfig,
    normalizeLuaGagsDeleteLines,
    normalizeLuaGagsColors,
    normalizeLuaGagsWalkaConfig,
} from "../luaGagsSettings";

const ERROR_COLOR = createColorFormat('#ff0000');

function getGagColors(): Record<string, string> {
    return normalizeLuaGagsColors(characterStorage.get(LUA_GAGS_COLORS_STORAGE_KEY));
}

function getGagColorCodes(): Record<string, FormatStateSnapshot> {
    const colors = getGagColors();
    return Object.fromEntries(
        Object.entries(colors).map(([k, v]) => [k, createColorFormat(v)])
    );
}
const combatTypes = ["combat.avatar", "combat.team", "combat.others"]

class EmptyMatches extends Array<string> implements RegExpMatchArray {
    "0": string;
    groups: { [p: string]: string };
    index: number;
    input: string;
}

function isCombatMsg(
    _line: AnsiAwareBuffer,
    _matches: RegExpMatchArray,
    type: string
): RegExpMatchArray | undefined {
    return combatTypes.indexOf(type) > -1 ? new EmptyMatches() : undefined;
}

function gagsIsType(
    checkedType: string,
    _line: AnsiAwareBuffer,
    _matches: RegExpMatchArray,
    type: string
): RegExpMatchArray | undefined {
    return checkedType.match(type);
}

type PatternObj = { pattern: string; type?: number | null };

type GagNode = {
    name: string;
    patterns: PatternObj[];
    calls?: { func: string; args: string[] }[];
    script?: string;
    triggers?: GagNode[];
    multiline?: boolean;
};


type TriggerMatchFunction = (line: AnsiAwareBuffer, matches: RegExpMatchArray, type: string) => RegExpMatchArray | undefined;
type LuaGagCallback = (line: AnsiAwareBuffer, matches: RegExpMatchArray, type: string) => AnsiAwareBuffer;

function registerTrigger(
    container: Triggers | Trigger,
    triggerPatterns: (RegExp | TriggerMatchFunction | string)[],
    callback: LuaGagCallback,
    node: GagNode,
    parent: Triggers | Trigger,
) {
    return container instanceof Trigger
        ? container.registerChild(triggerPatterns, callback, node.name)
        : (parent as Triggers).registerTrigger(triggerPatterns, callback, node.name);
}

const deleteLines: Record<string, LuaGagDeleteMode> = { ...DEFAULT_LUA_GAGS_DELETE_LINES };

function applyDeleteLinesConfig(value: unknown) {
    const normalized = normalizeLuaGagsDeleteLines(value);
    LUA_GAG_LINE_TYPES.forEach(key => {
        deleteLines[key] = normalized[key];
    });
}

const walkaConfig: LuaGagsWalkaConfig = { ...DEFAULT_LUA_GAGS_WALKA_CONFIG };

function applyWalkaConfig(value: unknown) {
    const normalized = normalizeLuaGagsWalkaConfig(value);
    walkaConfig.ownSpecPrefix = normalized.ownSpecPrefix;
    walkaConfig.finPrefix = normalized.finPrefix;
}

function getDeleteMode(type: string): LuaGagDeleteMode {
    const mode = deleteLines[type];
    if (mode === 0 || mode === 1 || mode === 2) {
        return mode;
    }
    return 2;
}

export default function registerLuaGagTriggers(client: Client) {
    applyDeleteLinesConfig(characterStorage.get(LUA_GAGS_STORAGE_KEY));
    applyWalkaConfig(characterStorage.get(LUA_GAGS_WALKA_CONFIG_STORAGE_KEY));

    let gagsTable: Table | null = null;

    characterStorage.onChange(LUA_GAGS_STORAGE_KEY, (newValue) => {
        applyDeleteLinesConfig(newValue);
    });

    characterStorage.onChange(LUA_GAGS_WALKA_CONFIG_STORAGE_KEY, (newValue) => {
        applyWalkaConfig(newValue);
        if (gagsTable) {
            gagsTable.set('fin_prefix', walkaConfig.finPrefix);
        }
    });

    function toPattern(p: PatternObj) {
        if (p.type === 1) {
            return new RegExp(p.pattern);
        }
        if (p.type === 4) {
            const code = p.pattern.trim();
            if (code === "return is_combat_msg()") {
                return (line: AnsiAwareBuffer, matches: RegExpMatchArray, type: string) =>
                    isCombatMsg(line, matches, type);
            }
            const m = code.match(/^return scripts\.gags:is_type\("(.+)"\)$/);
            if (m) {
                return (line: AnsiAwareBuffer, matches: RegExpMatchArray, type: string) =>
                    gagsIsType(m[1], line, matches, type);
            }
            return () => undefined;
        }
        return p.pattern;
    }

    function registerNode(parent: Triggers | Trigger, node: GagNode) {
        const patterns = Array.isArray(node.patterns) ? node.patterns : [];
        const children = Array.isArray(node.triggers) ? node.triggers : [];

        if (patterns.length === 0 && children.length === 0) return;

        const container: Triggers | Trigger = parent;
        const callback: LuaGagCallback = (line, matches, _type) => {
            if (node.script != undefined) {
                const rawLine = line.text;

                global.line = line;
                global.matches = matches;
                resetSelection();

                // Set Lua variables with proper escaping
                luaEnv.parse(`line = "${escapeLuaString(rawLine)}"`).exec();
                if (matches) {
                    luaEnv.parse(createMatchesLuaCode(matches)).exec();
                } else {
                    luaEnv.parse("matches = {}").exec();
                }

                try {
                    luaEnv.parse(node.script).exec();
                } catch (e) {
                    const warn = `Zgłoś błąd w powyższej linii (kliknij w komunikat aby skopiować): ${e.message}`;
                    const warnBuffer = colorString(warn, ERROR_COLOR);
                    warnBuffer.createLink([0, warn.length], {
                        onClick: () => navigator.clipboard.writeText(line.text),
                        title: 'Kopiuj linię'
                    });
                    global.line.append("\n").appendBuffer(warnBuffer);
                }

                return global.line?.applyMudletColors();
            }
            return line;
        }

        const triggers: Trigger[] = []
        const triggerPatterns = patterns.map(pat => toPattern(pat));
        if (!node.multiline) {
            triggers.push(registerTrigger(container, triggerPatterns, callback, node, parent))
        } else {
            const prev = container;
            triggerPatterns.forEach(pattern => {
                registerTrigger(prev, [pattern], callback, node, parent)
            })
        }
        triggers.forEach(trigger => {
            children.forEach(ch => registerNode(trigger, ch));
        })

    }

    function createLuaEnv() {
        const global: { line?: AnsiAwareBuffer, matches?: RegExpMatchArray, color?: FormatStateSnapshot } = {
            line: null,
            matches: null,
            color: null
        }

        let selection = [0, 0]

        const gags = {
            get fin_prefix() { return walkaConfig.finPrefix; },
            gag(_, value: string, totalValue: string, type: string) {
                gags.gag_prefix(null, `${value}/${totalValue}`, type)
            },
            gag_prefix: (_, prefix: string, type: string) => {
                const mode = getDeleteMode(type);
                if (mode === 1) {
                    return global.line.markAsDeleted();
                }
                if (mode !== 2) {
                    return global.line
                }
                const colorCodes = getGagColorCodes();
                global.line.prefix(`[${prefix}] `, colorCodes[type])
            },
            gag_own_spec: (_, power: string, maxPower: string) => {
                const ownPrefix = walkaConfig.ownSpecPrefix;
                let prefix = ownPrefix ? `${ownPrefix} ${power}` : `${power}`;
                if (maxPower) {
                    prefix += `/${maxPower}`
                }
                gags.gag_prefix(null, prefix, "moje_spece")
            },
            gag_spec: (_, prefix: string, power: string, maxPower: string, type: string) => {
                const ownPrefix = prefix == "" ? "" : prefix + " "
                gags.gag_prefix(null, `${ownPrefix}${power}/${maxPower}`, type)
            },
            attacker_target: (_, value: string) => {
                const totalPower= value ?? "6";
                const target = gags.who_hits()
                gags.gag(null, value, totalPower, target)
            },
            attacker_target_fin: () => {
                const target = gags.who_hits()
                gags.gag_prefix(null, gags.fin_prefix, target)
            },
            delete_line: (_, type: string) => {
                const mode = getDeleteMode(type);
                if (mode === 1) {
                    global.line.markAsDeleted();
                    return true;
                }
                return false
            },
            is_type: (_, type: string) => {
                return gmcp?.gmcp_msgs?.type == type
            },
            who_hits: () => {
                let who;
                if (gags.is_type(null,"combat.avatar")) {
                    who = global.line.text.match(/ciebie|cie|ci/) ? "innych_ciosy_we_mnie" : "moje_ciosy"
                } else {
                    who = "innych_ciosy"
                }
                return who
            }
            ,
            who_hits_attacker_target: () => {
                if (gags.is_type(null,"combat.avatar")) {
                    return global.matches.groups.attacker ? "innych_ciosy_we_mnie" : "moje_ciosy"
                } else return "innych_ciosy"
            }
        }

        const gagColors = {
            moje_ciosy:  "alice_blue",
            moje_spece:  "green_yellow",
            innych_ciosy:  "LightGrey",
            innych_ciosy_we_mnie:  "LightGrey",
            innych_spece:  "slate_grey",
            moje_uniki:  "SteelBlue",
            innych_uniki:  "dark_slate_grey",
            moje_parowanie:  "SteelBlue",
            innych_parowanie:  "dark_slate_gray",
            zaslony_udane:  "deep_sky_blue",
            zaslony_nieudane:  "dark_slate_blue",
            bron:  "gold",
            npc:  "floral_white",
            npc_spece:  "floral_white"
        }

        const team_names = new luainjs.Table([])
        team_names.metatable = new Table()
        team_names.metatable.set("__index", (_: any, name: string) => {
            return client.TeamManager.getTeamMembers().find(n => n === name)
        })

        const ateam = {
            may_setup_paralyzed_name: (_, name: string) => {
                client.sendEvent("enemy.paralyzed", { name });
            },
            may_setup_broken_defense: (_, name: string) => {
                client.sendEvent("enemy.broken_defense", { name });
            },
            may_end_paralyzed_name: (_, name: string) => {
                client.sendEvent("enemy.paralyzed.end", { name });
            },
            team_names: team_names
        }

        const rex = {
            match(str: string, pattern: string) {
                return str.match(pattern)
            },
            gsub(str: string, pattern: string, repl: string) {
                return str.replace(pattern, repl)
            },
            lower(str: string) {
                return str.toLowerCase()
            },
            upper(str: string) {
                return str.toUpperCase()
            }
        }

        const gagsTable = new luainjs.Table(gags);
        const scripts = {
            gags: gagsTable,
            gag_colors: new luainjs.Table(gagColors),
            utils: new luainjs.Table({
                bind_functional: (string: string) => {
                    client.FunctionalBind.newMessage()
                    client.FunctionalBind.set(string)
                },
                echobind: (string: string) => {
                    client.FunctionalBind.newMessage()
                    client.FunctionalBind.set(string)
                }
            }),
            ui: new luainjs.Table({
                info_action_update: () => {},
                info_action_bind: null,
            }),
            keybind: new luainjs.Table({
                keybind_tostring: () => {
                    return client.FunctionalBind.getLabel()
                }
            }),
            inv: new luainjs.Table({
                weapons: new luainjs.Table({
                    wield: `${client.drawWeaponCommand} wszystkich broni`
                })
            })
        }

        const mudlet = {
            debug: (line: string) => {
                console.log(line)
            },
            echo: (line: string) => {
                global.line.append(line)
            },
            creplaceLine: (line: string) => {
                global.line = mudletColorLine(line)
            },
            cecho: (line: string) => {
                if (global.color)  {
                    global.line.prefix(`<${global.color}>`)
                }
                global.line.append(line)
            },
            resetFormat: () => {
                global.color = null
            },
            selectCurrentLine: () => {
                selection = [0, global.line.length]
            },
            selectString: (string: string, index: number) => {
                // index is the occurrence number (1-based): 1 = first occurrence, 2 = second, etc.
                let startIndex = -1;
                let searchFrom = 0;
                for (let i = 0; i < index; i++) {
                    startIndex = global.line.text.indexOf(string, searchFrom);
                    if (startIndex === -1) {
                        selection = [-1, -1];
                        return;
                    }
                    searchFrom = startIndex + 1;
                }
                selection = [startIndex, startIndex + string.length];
            },
            raiseEvent(event: string, ...args: any[]) {
                client.sendEvent(event, ...args)
            },
            setFgColor(rgb: number[]) {
                const hexColor = '#' + rgb
                        .map(v => v.toString(16).padStart(2, '0'))
                        .join('');
                global.color = createColorFormat(hexColor)
                mudlet.fg(global.color)
            },
            prefix(prefix: string) {
                global.line = global.line.prefix(prefix, global.color)
            },
            fg(stringColor: string | FormatStateSnapshot) {
                if (typeof stringColor === "string") {
                    global.color = createColorFormat(mudletColors[stringColor])
                }
                if (selection[0] > -1 && selection[0] !== selection[1]) {
                    global.line.color([selection[0], selection[1]], global.color)
                }
            },
            tempTimer(time: number, callback: LuaType) {
                if (typeof callback == "function") {
                    setTimeout(callback, time * 1000)
                }
            },
            getCurrentLine: () => {
                return global.line.text
            },
            display: (object: any)=> {
                console.log(object)
            }
        }

        const resetSelection = () => {
            selection = [-1, -1];
        };

        const luaEnv = luainjs.createEnv({})
        luaEnv.loadLib("mudlet", new luainjs.Table(mudlet))
        luaEnv.loadLib("rex", new luainjs.Table(rex))
        Object.keys(mudlet).forEach((key) => {
            luaEnv.parse(`${key} = mudlet.${key}`).exec()
        })
        luaEnv.loadLib("scripts", new luainjs.Table(scripts))
        luaEnv.loadLib("ateam", new luainjs.Table(ateam))
        return {global, luaEnv, resetSelection, gagsTable};
    }

    function escapeLuaString(str: string): string {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
    }

    function createMatchesLuaCode(matches: RegExpMatchArray): string {
        const entries: string[] = [];

        // Add indexed groups (1-based for Lua)
        matches.forEach((value, index) => {
            if (value !== undefined) {
                entries.push(`[${index + 1}] = "${escapeLuaString(value)}"`);
            }
        });

        // Add named groups
        if (matches.groups) {
            Object.entries(matches.groups).forEach(([key, value]) => {
                if (value !== undefined) {
                    entries.push(`["${key}"] = "${escapeLuaString(value)}"`);
                }
            });
        }

        return `matches = {${entries.join(", ")}}`;
    }


    (gagsData as GagNode[]).forEach(group => registerNode(client.Triggers, group));
    client.on("playSound", (category: string) => {
        client.sendEvent("sound:category", category as SoundCategory);
    });

    const {global, luaEnv, resetSelection, gagsTable: gagsTableRef} = createLuaEnv();
    gagsTable = gagsTableRef;
    const luaFiles = import.meta.glob("../lua/**/*.lua", {query: "?raw", eager: true});
    Object.values(luaFiles).forEach((file: any) => {
        luaEnv.parse(file.default).exec()
    });
}
