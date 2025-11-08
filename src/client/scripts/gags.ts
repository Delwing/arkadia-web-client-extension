import {colorStringInLine, createColorFormat} from "@modules/core/Colors";
import Client from "../Client";
import {AnsiAwareBuffer} from "../ansi/FormatState";

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
    Object.entries(gagColors).map(([k, v]) => [k, createColorFormat(v)])
) as Record<string, number>;
const OWN_HIT_COLOR = createColorFormat('#2db92d');
const DAMAGE_COLOR = createColorFormat('#ff9933');
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
        const prefixText = `[${prefix}] `;
        buffer.prepend(prefixText);
        return buffer.color([0, prefixText.length], gagColorCodes[type]);
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

    function color_hit(matches: RegExpMatchArray, value: string, type: string, buffer: AnsiAwareBuffer) {
        let target = type == "combat.avatar" ? "innych_ciosy_we_mnie" : "innych_ciosy";
        let line: AnsiAwareBuffer = buffer;

        if (matches.groups.target) {
            line = colorStringInLine(line, matches.groups.damage + " cie", DAMAGE_COLOR);
        } else {
            target = "innych_ciosy";
            line = colorStringInLine(line, matches.groups.damage, DAMAGE_COLOR);
        }
        return gag(line, value, "6", target);
    }

    function gagOtherRegularHits(matches: RegExpMatchArray, type: string, buffer: AnsiAwareBuffer) {
        const damage = matches.groups.damage
        let value = 0
        switch (damage) {
            case "ledwo muska":
                value = 1
                break
            case "lekko rani":
                value = 2
                break
            case "rani":
                value = 3
                break
            case "powaznie rani":
                value = 4
                break;
            case "bardzo ciezko rani":
                value = 5
                break;
            case "masakruje":
            case "smiertelnie rani":
                value = 6
                break;
        }


        return color_hit(matches, value.toString(), type, buffer);
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
    combatMessages.registerChild(/^(?<attacker>\w+(?: \w+){0,4}?) (?<damage>ledwo muska|lekko rani|bardzo ciezko rani|powaznie rani|rani|masakruje|smiertelnie rani) (?<target>cie) (?<weapon>.+?), trafiajac cie w (?<where>.*)\.$/, (line, matches, type) => {
        return gagOtherRegularHits(matches as RegExpMatchArray, type, line);
    });
    combatMessages.registerChild(/^(?<attacker>\w+(?: \w+){0,4}?) (?<damage>ledwo muska|lekko rani|bardzo ciezko rani|powaznie rani|rani|masakruje|smiertelnie rani) (?<target_weapon>.+?), trafiajac (?:go|ja|je) w (?<where>.*)\.$/, (line, matches, type) => {
        return gagOtherRegularHits(matches as RegExpMatchArray, type, line);
    });
}

