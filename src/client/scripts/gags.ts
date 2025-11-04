import {colorStringInLine, findClosestColor} from "@modules/core/Colors";
import Client from "../Client";
import TriggerLine from "../triggers/TriggerLine";

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
const OWN_HIT_COLOR = findClosestColor('#2db92d');
const DAMAGE_COLOR = findClosestColor('#ff9933');
const combatTypes = ["combat.avatar", "combat.team", "combat.others"]

class EmptyMatches extends Array<string> implements RegExpMatchArray {
    "0": string;
    groups: { [p: string]: string };
    index: number;
    input: string;
}export default function registerGagTriggers(client: Client) {



    function isCombatMsg(
        triggerLine: TriggerLine
    ): RegExpMatchArray | undefined {
        const type = triggerLine.matches.type || "";
        return combatTypes.indexOf(type) > -1 ? new EmptyMatches() : undefined;
    }

    function gag(rawLine: TriggerLine | string, power: string, totalPower: string, kind: string) {
        return gagPrefix(rawLine, `${power}/${totalPower}`, kind)
    }

    function gagPrefix(rawLine: TriggerLine | string, prefix: string, type: string) {
        const line = rawLine instanceof TriggerLine ? rawLine : new TriggerLine(rawLine);
        const prefixText = `[${prefix}] `;
        line.prepend(prefixText);
        return line.color([0, prefixText.length], gagColorCodes[type]);
    }

    function gagOwnRegularHits(rawLine: string, matches: RegExpMatchArray | { index: number }, power: string, triggerLine?: TriggerLine) {
        const ignoreList = [
            "opalizujacego runicznego",
            "czarnoblekitnego pulsujacego morgensterna",
            "czarnego smuklego topora",
            "srebrzyst\\w+ kos\\w+ bojow\\w+"
        ]


        if (ignoreList.filter(ignore => rawLine.match(ignore)).length > 0) {
            return triggerLine ?? new TriggerLine(rawLine)
        }

        const line = colorStringInLine(triggerLine ?? rawLine, matches[0], OWN_HIT_COLOR)


        return gag(line, power, "6", "moje_ciosy")
    }

    function color_hit(rawLine: string, matches: RegExpMatchArray, value: string, type: string, triggerLine?: TriggerLine) {
        let target = type == "combat.avatar" ? "innych_ciosy_we_mnie" : "innych_ciosy"
        let line: TriggerLine | string = triggerLine ?? rawLine

        if (matches.groups.target) {
            line = colorStringInLine(line, matches.groups.damage + " cie", DAMAGE_COLOR)
        } else {
            target = "innych_ciosy"
            line = colorStringInLine(line, matches.groups.damage, DAMAGE_COLOR)
        }
        return gag(line, value, "6", target)
    }

    function gagOtherRegularHits(rawLine: string, matches: RegExpMatchArray, type: string, triggerLine?: TriggerLine) {
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


        return color_hit(rawLine, matches, value.toString(), type, triggerLine)
    }

    const combatMessages = client.Triggers.registerTrigger(isCombatMsg)
    combatMessages.registerChild(/^Ledwo muskasz/, (triggerLine) => {
        const rawLine = triggerLine.toAnsiString();
        const matches = triggerLine.matches.matches as RegExpMatchArray;
        return gagOwnRegularHits(rawLine, matches, "1", triggerLine);
    })
    combatMessages.registerChild(/^Lekko ranisz/, (triggerLine) => {
        const rawLine = triggerLine.toAnsiString();
        const matches = triggerLine.matches.matches as RegExpMatchArray;
        return gagOwnRegularHits(rawLine, matches, "2", triggerLine);
    })
    combatMessages.registerChild(/^Ranisz/, (triggerLine) => {
        const rawLine = triggerLine.toAnsiString();
        const matches = triggerLine.matches.matches as RegExpMatchArray;
        return gagOwnRegularHits(rawLine, matches, "3", triggerLine);
    })
    combatMessages.registerChild(/^Powaznie ranisz/, (triggerLine) => {
        const rawLine = triggerLine.toAnsiString();
        const matches = triggerLine.matches.matches as RegExpMatchArray;
        return gagOwnRegularHits(rawLine, matches, "4", triggerLine);
    })
    combatMessages.registerChild(/^Bardzo ciezko ranisz/, (triggerLine) => {
        const rawLine = triggerLine.toAnsiString();
        const matches = triggerLine.matches.matches as RegExpMatchArray;
        return gagOwnRegularHits(rawLine, matches, "5", triggerLine);
    })
    combatMessages.registerChild(/^Masakrujesz/, (triggerLine) => {
        const rawLine = triggerLine.toAnsiString();
        const matches = triggerLine.matches.matches as RegExpMatchArray;
        return gagOwnRegularHits(rawLine, matches, "6", triggerLine);
    })
    combatMessages.registerChild(/^(?<attacker>\w+(?: \w+){0,4}?) (?<damage>ledwo muska|lekko rani|bardzo ciezko rani|powaznie rani|rani|masakruje|smiertelnie rani) (?<target>cie) (?<weapon>.+?), trafiajac cie w (?<where>.*)\.$/, (triggerLine) => {
        const rawLine = triggerLine.toAnsiString();
        const matches = triggerLine.matches.matches as RegExpMatchArray;
        const type = triggerLine.matches.type || "";
        return gagOtherRegularHits(rawLine, matches, type, triggerLine);
    })
    combatMessages.registerChild(/^(?<attacker>\w+(?: \w+){0,4}?) (?<damage>ledwo muska|lekko rani|bardzo ciezko rani|powaznie rani|rani|masakruje|smiertelnie rani) (?<target_weapon>.+?), trafiajac (?:go|ja|je) w (?<where>.*)\.$/, (triggerLine) => {
        const rawLine = triggerLine.toAnsiString();
        const matches = triggerLine.matches.matches as RegExpMatchArray;
        const type = triggerLine.matches.type || "";
        return gagOtherRegularHits(rawLine, matches, type, triggerLine);
    })
}

