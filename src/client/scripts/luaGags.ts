import Triggers, {stripAnsiCodes, Trigger} from "../Triggers";
import gagsData from "./gags_lua.json";
import {colorString, findClosestColor, mudletColorLine} from "@modules/core/Colors";
import TriggerLine from "../triggers/TriggerLine";

import * as luainjs from 'lua-in-js'
import {gmcp} from "../gmcp";

import mudletColors from "../colors.json"
import {LuaType} from "lua-in-js/dist/types/utils";
import Client from "../Client";
import { getItemSync } from "@modules/core/storage";
import {
    DEFAULT_LUA_GAGS_DELETE_LINES,
    LUA_GAG_LINE_TYPES,
    LUA_GAGS_STORAGE_KEY,
    LuaGagDeleteMode,
    normalizeLuaGagsDeleteLines,
} from "../luaGagsSettings";
import {Table} from "lua-in-js";

const ERROR_COLOR = findClosestColor('#ff0000');

const gagColors = {
    "moje_ciosy": "#f0f8ff",
    "moje_spece": "#adff2f",
    "innych_ciosy": "#d3d3d3",
    "innych_ciosy_we_mnie": "#d3d3d3",
    "innych_spece": "#708090",
    "moje_uniki": "#4682b4",
    "innych_uniki": "#2f4f4f",
    "moje_parowanie": "#4682b4",
    "innych_parowanie": "#2f4f4f",
    "zaslony_udane": "#00bfff",
    "zaslony_nieudane": "#483d8b",
    "bron": "#ffd700",
    "npc": "#fffaf0",
    "npc_spece": "#fffaf0"
};
const gagColorCodes: Record<string, number> = Object.fromEntries(
    Object.entries(gagColors).map(([k, v]) => [k, findClosestColor(v)])
) as Record<string, number>;
const combatTypes = ["combat.avatar", "combat.team", "combat.others"]

class EmptyMatches extends Array<string> implements RegExpMatchArray {
    "0": string;
    groups: { [p: string]: string };
    index: number;
    input: string;
}

function isCombatMsg(
    triggerLine: TriggerLine
): RegExpMatchArray | undefined {
    const type = triggerLine.matches.type || "";
    return combatTypes.indexOf(type) > -1 ? new EmptyMatches() : undefined;
}

function gagsIsType(
    checkedType: string,
    triggerLine: TriggerLine
): RegExpMatchArray | undefined {
    const type = triggerLine.matches.type || "";
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


type TriggerMatchFunction = (triggerLine: TriggerLine) => RegExpMatchArray | undefined;
type LuaGagCallback = (triggerLine: TriggerLine) => TriggerLine;

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

function getDeleteMode(type: string): LuaGagDeleteMode {
    const mode = deleteLines[type];
    if (mode === 0 || mode === 1 || mode === 2) {
        return mode;
    }
    return 2;
}

export default function registerLuaGagTriggers(client: Client) {
    applyDeleteLinesConfig(getItemSync(LUA_GAGS_STORAGE_KEY)?.[LUA_GAGS_STORAGE_KEY]);

    client.on("storage", ({ key, value }) => {
        if (key === LUA_GAGS_STORAGE_KEY) {
            applyDeleteLinesConfig(value);
        }
    });

    client.on("port-connected", () => {
        client.port?.postMessage({ type: "GET_STORAGE", key: LUA_GAGS_STORAGE_KEY });
    });

    client.port?.postMessage({ type: "GET_STORAGE", key: LUA_GAGS_STORAGE_KEY });

    function toPattern(p: PatternObj) {
        if (p.type === 1) {
            return new RegExp(p.pattern);
        }
        if (p.type === 4) {
            const code = p.pattern.trim();
            if (code === "return is_combat_msg()") {
                return (triggerLine: TriggerLine) =>
                    isCombatMsg(triggerLine);
            }
            const m = code.match(/^return scripts\.gags:is_type\("(.+)"\)$/);
            if (m) {
                return (triggerLine: TriggerLine) =>
                    gagsIsType(m[1], triggerLine);
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
        const callback: LuaGagCallback = (triggerLine) => {
            if (node.script != undefined) {
                const rawLine = triggerLine.toAnsiString();
                const matches = triggerLine.matches.matches as RegExpMatchArray | undefined;

                global.line = rawLine;
                global.matches = matches;

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
                    const clickable = client.OutputHandler.makeClickable(
                        warn,
                        warn,
                        () => navigator.clipboard.writeText(triggerLine.text),
                        'Kopiuj linie'
                    );
                    global.line = global.line + "\n" + colorString(clickable, ERROR_COLOR);
                }

                const updatedLine = new TriggerLine(
                    global.line,
                    triggerLine.matches,
                    triggerLine.isMutable(),
                );
                updatedLine.setOverrideAnsi(global.line);
                return updatedLine;
            }
            return triggerLine;
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


    function getColorCode(stringColor: string | number) {
        if (typeof stringColor == "number") {
            return stringColor;
        }
        return findClosestColor(mudletColors[stringColor]);
    }

    function createLuaEnv() {
        const global: { line?: string, matches?: RegExpMatchArray, color?: string | number } = {
            line: null,
            matches: null,
            color: null
        }

        let selection = [0, 0]

        const gags = {
            fin_prefix: "FIN",
            gag(_, value: string, totalValue: string, type: string) {
                gags.gag_prefix(null, `${value}/${totalValue}`, type)
            },
            gag_prefix: (_, prefix: string, type: string) => {
                const mode = getDeleteMode(type);
                if (mode === 1) {
                    global.line = "";
                    return;
                }
                if (mode !== 2) {
                    return;
                }
                global.line = colorString(`[${prefix}] `, gagColorCodes[type]) + global.line
            },
            gag_own_spec: (_, power: string, maxPower: string) => {
                let prefix = `${power}`
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
                    global.line = "";
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
                    who = global.line.match(/ciebie|cie|ci/) ? "innych_ciosy_we_mnie" : "moje_ciosy"
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
            may_setup_paralyzed_name: (_, name: string) => console.log("Ogluch " + name),
            may_setup_broken_defense: (_, name: string) => console.log("Przelamanie " + name),
            may_end_paralyzed_name: (_, name: string) => console.log("Koniec oglucha " + name),
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

        const scripts = {
            gags: new luainjs.Table(gags),
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
                global.line = global.line + line
            },
            creplaceLine: (line: string) => {
                global.line = mudletColorLine(line)
            },
            cecho: (line: string) => {
                if (global.color)  {
                    global.line += `<${global.color}>`
                }
                global.line += mudletColorLine(line)
            },
            resetFormat: () => {
                global.color = null
            },
            selectCurrentLine: () => {
                selection = [0, global.line.length]
            },
            selectString: (string: string, index: number) => {
                const startIndex = global.line.indexOf(string, index - 1)
                selection = [startIndex, startIndex + string.length]
            },
            raiseEvent(event: string, ...args: any[]) {
                client.sendEvent(event, args)
            },
            setFgColor(rgb: number[]) {
                global.color = rgb.join(",")
                mudlet.fg(findClosestColor(rgb))
            },
            prefix(prefix: string) {
                if (global.color) {
                    prefix = `<${global.color}>` + prefix
                }
                global.line = mudletColorLine(prefix + stripAnsiCodes(global.line))
            },
            fg(stringColor: string | number) {
                global.color = stringColor
                if (selection[0] > -1 && selection[0] !== selection[1]) {
                    global.line = global.line.substring(0, selection[0]) + colorString(stripAnsiCodes(global.line.substring(selection[0], selection[1])), getColorCode(stringColor)) + global.line.substring(selection[1])
                }
            },
            tempTimer(time: number, callback: LuaType) {
                if (typeof callback == "function") {
                    setTimeout(callback, time * 1000)
                }
            },
            getCurrentLine: () => {
                return global.line
            },
            display: (object: any)=> {
                console.log(object)
            }
        }

        const luaEnv = luainjs.createEnv({})
        luaEnv.loadLib("mudlet", new luainjs.Table(mudlet))
        luaEnv.loadLib("rex", new luainjs.Table(rex))
        Object.keys(mudlet).forEach((key) => {
            luaEnv.parse(`${key} = mudlet.${key}`).exec()
        })
        luaEnv.loadLib("scripts", new luainjs.Table(scripts))
        luaEnv.loadLib("ateam", new luainjs.Table(ateam))
        return {global, luaEnv};
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
    client.on("playBeep", () => {
        client.sendEvent("sound:play", { key: "beep" })
    })

    const {global, luaEnv} = createLuaEnv();
    const luaFiles = import.meta.glob("../lua/**/*.lua", {query: "?raw", eager: true});
    Object.values(luaFiles).forEach((file: any) => {
        luaEnv.parse(file.default).exec()
    });
}
