import Client from "../Client";
import followPatterns from "./follow_special_exits_patterns.json";

interface PatternEntry {
    pattern: string;
    type: number;
}

interface TriggerEntry {
    name: string;
    script: string;
    patterns: PatternEntry[];
}

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

type CommandResolver = string | ((m: RegExpMatchArray) => string);

// A handful of source patterns appear in two entries with conflicting commands.
// Pin them to the intended command regardless of registration order.
const COMMAND_OVERRIDES: Record<string, string> = {
    "przeslizguje sie przez szczeline.": "przecisnij sie przez szczeline",
};

// Mirrors the Lua trigger_func_skrypty_ui_special_exits_follow argument handling:
// the command is either a literal string or built from the first capture group
// (Lua matches[2]).
function resolveCommand(script: string, client: Client): CommandResolver {
    const open = script.indexOf('(');
    const close = script.lastIndexOf(')');
    const body = script.slice(open + 1, close).trim();

    if (body.includes('matches[2]')) {
        const [pre, post] = body.split('matches[2]');
        const prefix = literalOf(pre);
        const suffix = literalOf(post);
        return (m) => `${prefix}${m[1] ?? ''}${suffix}`;
    }

    const command = literalOf(body);
    // The source package hardcodes "dobadz" but the draw-weapon verb is
    // character-specific; resolve it at fire time.
    if (command.includes('dobadz wszystkich broni')) {
        return () => command.replace(/dobadz wszystkich broni/g, `${client.drawWeaponCommand} wszystkich broni`);
    }
    return command;
}

function literalOf(fragment: string): string {
    const m = fragment.match(/"((?:[^"\\]|\\.)*)"/);
    return m ? m[1] : '';
}

export default function initFollowSpecialExits(client: Client) {
    const tag = "follow-special-exits";

    function containsLeader(line: string) {
        const leader = client.TeamManager.getLeader();
        return !!leader && line.toLowerCase().includes(leader.toLowerCase());
    }

    // Two overrides applied by the Lua follow function before binding.
    function applyLuaOverrides(lineText: string, command: string): string {
        if (/podchodzi do cedru na skraju urwiska/.test(lineText)) {
            return "zejdz po linie";
        }
        if (client.Map.currentRoom?.id === 17944 && !command.includes("wejdz na gore")) {
            return "wejdz na gore";
        }
        return command;
    }

    function register(pattern: string | RegExp, resolver: CommandResolver) {
        client.Triggers.registerTrigger(pattern, (line, matches) => {
            if (!containsLeader(line.text)) return undefined;
            const command = typeof resolver === "function" ? resolver(matches) : resolver;
            const finalCommand = applyLuaOverrides(line.text, command);
            client.FunctionalBind.set(finalCommand);
            client.sendEvent('followSpecialExit', {exit: finalCommand});
            return undefined;
        }, tag);
    }

    for (const entry of followPatterns as TriggerEntry[]) {
        const resolver = resolveCommand(entry.script, client);
        for (const patternEntry of entry.patterns) {
            const override = COMMAND_OVERRIDES[patternEntry.pattern];
            register(patternToTrigger(patternEntry), override ?? resolver);
        }
    }
}
