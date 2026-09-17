import * as luainjs from "lua-in-js";
import Client from "../Client";
import followPatterns from "./follow_special_exits_patterns.json";
import followLua from "../lua/follow/special_exits_follow.lua?raw";
import {createMatchesLuaCode, escapeLuaString} from "../luaInterop";

interface PatternEntry {
    pattern: string;
    type: number;
}

interface TriggerEntry {
    name: string;
    script: string;
    patterns: PatternEntry[];
}

const FOLLOW_FUNC = "trigger_func_skrypty_ui_special_exits_follow";

// Mudlet pattern types:
// 0 = substring (matches anywhere)
// 1 = regex
// 2 = startOfLine (substring at start)
// 3 = exactMatch (entire line must match)
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternToTrigger(entry: PatternEntry): string | RegExp {
    const {pattern, type} = entry;
    switch (type) {
        case 1: // regex
            return new RegExp(pattern);
        case 2: // startOfLine
            return new RegExp(`^${escapeRegExp(pattern)}`);
        case 3: // exactMatch
            return new RegExp(`^${escapeRegExp(pattern)}$`);
        case 0: // substring
        default:
            return pattern;
    }
}

// A handful of source patterns appear in two entries with conflicting commands.
// Pin them to the intended command regardless of registration order.
const COMMAND_OVERRIDES: Record<string, string> = {
    "przeslizguje sie przez szczeline.": "przecisnij sie przez szczeline",
};

export default function initFollowSpecialExits(client: Client) {
    const tag = "follow-special-exits";

    function containsLeader(line: string) {
        const leader = client.TeamManager.getLeader();
        return !!leader && line.toLowerCase().includes(leader.toLowerCase());
    }

    function bindFollow(command: string) {
        // The source package hardcodes "dobadz" but the draw-weapon verb is
        // character-specific; resolve it at fire time.
        const finalCommand = command.replace(/dobadz wszystkich broni/g, `${client.drawWeaponCommand} wszystkich broni`);
        client.FunctionalBind.set(finalCommand);
        client.sendEvent('followSpecialExit', {exit: finalCommand});
    }

    // The upstream follow function (synced by scripts/extract-follow-patterns.mjs)
    // rewrites the command based on the line and the current room before binding.
    const amap = new luainjs.Table({});
    const luaEnv = luainjs.createEnv({});
    luaEnv.loadLib("amap", amap);
    luaEnv.loadLib("scripts", new luainjs.Table({
        utils: new luainjs.Table({
            bind_functional_team_follow: (command: string) => bindFollow(command),
        }),
    }));
    luaEnv.parse(followLua).exec();

    function register(pattern: string | RegExp, script: string) {
        const chunk = luaEnv.parse(script);
        client.Triggers.registerTrigger(pattern, (line, matches) => {
            if (!containsLeader(line.text)) return undefined;
            // Always provide a curr table: lua-in-js does not short-circuit
            // `amap.curr and amap.curr.id == X` when curr is nil.
            amap.set("curr", new luainjs.Table({id: client.Map.currentRoom?.id ?? -1}));
            try {
                luaEnv.parse(`line = "${escapeLuaString(line.text)}"`).exec();
                luaEnv.parse(matches ? createMatchesLuaCode(matches) : "matches = {}").exec();
                chunk.exec();
            } catch (e) {
                console.error(`[followSpecialExits] ${script}:`, e);
            }
            return undefined;
        }, tag);
    }

    for (const entry of followPatterns as TriggerEntry[]) {
        for (const patternEntry of entry.patterns) {
            const override = COMMAND_OVERRIDES[patternEntry.pattern];
            const script = override ? `${FOLLOW_FUNC}("${escapeLuaString(override)}")` : entry.script;
            register(patternToTrigger(patternEntry), script);
        }
    }
}
