import {colorStringInLine, createColorFormat} from "@modules/core/Colors";
import Client from "../Client";
import {AnsiAwareBuffer} from "../ansi/FormatState";
import {getItemSync} from "@modules/core/storage";
import {
    LUA_GAGS_COLORS_STORAGE_KEY,
    LUA_GAGS_STORAGE_KEY,
    normalizeLuaGagsColors,
    normalizeLuaGagsDeleteLines,
    LuaGagDeleteMode,
} from "../luaGagsSettings";

function getDeleteMode(type: string): LuaGagDeleteMode {
    const stored = getItemSync(LUA_GAGS_STORAGE_KEY);
    const settings = normalizeLuaGagsDeleteLines(stored?.[LUA_GAGS_STORAGE_KEY]);
    return settings[type as keyof typeof settings] ?? 2;
}

function getGagColorCodes(): Record<string, number> {
    const stored = getItemSync(LUA_GAGS_COLORS_STORAGE_KEY);
    const colors = normalizeLuaGagsColors(stored?.[LUA_GAGS_COLORS_STORAGE_KEY]);
    return Object.fromEntries(
        Object.entries(colors).map(([k, v]) => [k, createColorFormat(v)])
    ) as Record<string, number>;
}
const OWN_HIT_COLOR = createColorFormat('#2db92d');
const combatTypes = ["combat.avatar", "combat.team", "combat.others"]

class EmptyMatches extends Array<string> implements RegExpMatchArray {
    "0": string;
    groups: { [p: string]: string };
    index: number;
    input: string;
}export default function registerGagTriggers(client: Client) {



    function isCombatMsg(
        _line: AnsiAwareBuffer,
        _matches: RegExpMatchArray,
        type: string
    ): RegExpMatchArray | undefined {
        return combatTypes.indexOf(type) > -1 ? new EmptyMatches() : undefined;
    }

    function gag(buffer: AnsiAwareBuffer, power: string, totalPower: string, kind: string) {
        return gagPrefix(buffer, `${power}/${totalPower}`, kind);
    }

    function gagPrefix(buffer: AnsiAwareBuffer, prefix: string, type: string) {
        const mode = getDeleteMode(type);
        if (mode === 1) {
            return buffer.markAsDeleted();
        }
        if (mode !== 2) {
            return buffer;
        }
        const prefixText = `[${prefix}] `;
        buffer.prepend(prefixText);
        const colorCodes = getGagColorCodes();
        return buffer.color([0, prefixText.length], colorCodes[type]);
    }

    function gagOwnRegularHits(matches: RegExpMatchArray | { index: number }, power: string, buffer: AnsiAwareBuffer) {
        const ignoreList = [
            "opalizujacego runicznego",
            "czarnoblekitnego pulsujacego morgensterna",
            "czarnego smuklego topora",
            "srebrzyst\\w+ kos\\w+ bojow\\w+"
        ]

        const rawLine = buffer.text;
        if (ignoreList.filter(ignore => rawLine.match(ignore)).length > 0) {
            return buffer;
        }

        const line = colorStringInLine(buffer, matches[0], OWN_HIT_COLOR);
        return gag(line, power, "6", "moje_ciosy");
    }

    const combatMessages = client.Triggers.registerTrigger(isCombatMsg);
    combatMessages.registerChild(/^Ledwo muskasz/, (line, matches) => {
        return gagOwnRegularHits(matches as RegExpMatchArray, "1", line);
    });
    combatMessages.registerChild(/^Lekko ranisz/, (line, matches) => {
        return gagOwnRegularHits(matches as RegExpMatchArray, "2", line);
    });
    combatMessages.registerChild(/^Ranisz/, (line, matches) => {
        return gagOwnRegularHits(matches as RegExpMatchArray, "3", line);
    });
    combatMessages.registerChild(/^Powaznie ranisz/, (line, matches) => {
        return gagOwnRegularHits(matches as RegExpMatchArray, "4", line);
    });
    combatMessages.registerChild(/^Bardzo ciezko ranisz/, (line, matches) => {
        return gagOwnRegularHits(matches as RegExpMatchArray, "5", line);
    });
    combatMessages.registerChild(/^Masakrujesz/, (line, matches) => {
        return gagOwnRegularHits(matches as RegExpMatchArray, "6", line);
    });
}

