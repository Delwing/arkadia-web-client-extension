import Triggers, {stripAnsiCodes, Trigger} from "../Triggers";
import gagsData from "./gags_lua.json";
import {colorString, findClosestColor, color, RESET} from "../Colors";

import * as luainjs from 'lua-in-js'
import {gmcp} from "../gmcp";

import mudletColors from "../colors.json"
import {LuaType} from "lua-in-js/dist/types/utils";
import Client from "../Client";

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
    _rawLine: string,
    _line: string,
    _matches: any,
    type: string
): RegExpMatchArray | undefined {
    return combatTypes.indexOf(type) > -1 ? new EmptyMatches() : undefined;
}

function gagsIsType(
    checkedType: string,
    _rawLine: string,
    _line: string,
    _matches: any,
    type: string
): RegExpMatchArray | undefined {
    return checkedType.match(type)
}

type PatternObj = { pattern: string; type?: number | null };

type GagNode = {
    name: string;
    patterns: PatternObj[];
    calls?: { func: string; args: string[] }[];
    script?: string;
    triggers?: GagNode[];
};


export default function registerLuaGagTriggers(client: Client) {


    function toPattern(p: PatternObj) {
        if (p.type === 1) {
            return new RegExp(p.pattern);
        }
        if (p.type === 4) {
            const code = p.pattern.trim();
            if (code === "return is_combat_msg()") {
                return (raw: string, line: string, matches: any, type: string) =>
                    isCombatMsg(raw, line, matches, type);
            }
            const m = code.match(/^return scripts\.gags:is_type\("(.+)"\)$/);
            if (m) {
                return (raw: string, line: string, matches: any, type: string) =>
                    gagsIsType(m[1], raw, line, matches, type);
            }
            return () => undefined;
        }
        return p.pattern;
    }

    function registerNode(parent: Triggers | Trigger, node: GagNode) {
        const patterns = Array.isArray(node.patterns) ? node.patterns : [];
        const children = Array.isArray(node.triggers) ? node.triggers : [];

        if (patterns.length === 0 && children.length === 0) return;

        let container: Triggers | Trigger = parent;
        patterns.forEach((pat) => {
            const pattern = toPattern(pat);
            const callback = (rawLine: string, line: string, matches: RegExpMatchArray) => {
                if (node.script != undefined) {
                    global.line = rawLine
                    global.matches = matches
                    luaEnv.parse(`line = "${rawLine}"`).exec()
                    luaEnv.parse(createMatches(matches)).exec()
                    try {
                        luaEnv.parse(node.script).exec()
                    } catch (e) {
                        const warn = `Zglos blad w powyzszej lini: ${e.message}`
                        const clickable = client.OutputHandler.makeClickable(
                            warn,
                            warn,
                            () => navigator.clipboard.writeText(line),
                            'Kopiuj linie'
                        )
                        global.line = global.line + "\n" + colorString(clickable, ERROR_COLOR)

                    }
                    rawLine = global.line
                }
                return rawLine;
            }
            container = container instanceof Trigger
                ? container.registerChild(pattern, callback, node.name)
                : (parent as Triggers).registerTrigger(pattern, callback, node.name);
        });
        children.forEach(ch => registerNode(container, ch));
    }


    function getColorCode(stringColor: string | number) {
        if (typeof stringColor == "number") {
            return stringColor;
        }
        return findClosestColor(mudletColors[stringColor]);
    }

    function mudletColorLine(line: string) {
        return line.replace(/<(.+)>/g, (substring => {
            const stringColor = substring.substring(1, substring.length - 1)
            if (stringColor === "reset") {
                return RESET
            } else {
                return color(findClosestColor(mudletColors[stringColor] ?? stringColor.split(",")))
            }
        }));
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
                let ownPrefix = prefix == "" ? "" : prefix + " "
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
            delete_line: () => {
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

        const ateam = {
            may_setup_paralyzed_name: (_, name: string) => console.log("Ogluch " + name),
            may_setup_broken_defense: (_, name: string) => console.log("Przelamanie " + name),
            may_end_paralyzed_name: (_, name: string) => console.log("Koniec oglucha " + name),
            team_names: new luainjs.Table(client.TeamManager.getTeamMembers())
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
                    wield: "dobadz wszystkich broni"
                })
            })
        }

        const mudlet = {
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
                let startIndex = global.line.indexOf(string, index - 1)
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

    function createMatches(matches: RegExpMatchArray) {
        let namedGroups = matches.groups ? Object.entries(matches.groups).map(([key, value]) => `["${key}"] = "${value}"`) : []
        let indexedGroups = matches.map((value, index) => `[${index + 1}] = "${value}"`)
        let groups = [...namedGroups, ...indexedGroups]
        return `matches = {${groups.join(",")}}`
    }


    (gagsData as GagNode[]).forEach(group => registerNode(client.Triggers, group));
    client.addEventListener("playBeep", () => {
        client.playSound("beep")
    })

    let {global, luaEnv} = createLuaEnv();
    // @ts-ignore
    const luaFiles = import.meta.glob("../lua/**/*.lua", {query: "?raw", eager: true});
    Object.values(luaFiles).forEach((file) => {
        // @ts-ignore
        luaEnv.parse(file.default).exec()
    });
}

