import Client from "../Client";
import { colorStringInLine, findClosestColor, color, RESET } from "@modules/core/Colors";
import TriggerLine from "../triggers/TriggerLine";
import { MAGICS_COLOR } from "./magics";

export const WEAPON_COLOR = findClosestColor("#ffff00");

function isMagicColored(line: string, weapon: string): boolean {
    const colored = color(MAGICS_COLOR) + weapon + RESET;
    return line.includes(colored);
}

export default function initWeaponColors(client: Client) {
    const tag = "weaponColors";
    client.Triggers.registerTrigger(
        /^Trzyma(?:sz)? oburacz (?<weapon1>[a-z ]+)\.$/,
        (triggerLine) => {
            const m = triggerLine.matches.matches;
            if (!m || !m.groups) return triggerLine;
            const weapon = m.groups.weapon1;
            const raw = triggerLine.toAnsiString();
            if (isMagicColored(raw, weapon)) {
                return triggerLine;
            }
            return colorStringInLine(triggerLine, weapon, WEAPON_COLOR);
        },
        tag
    );
    client.Triggers.registerTrigger(
        /^Trzyma(?:sz)? (?<weapon1>[a-z ]+?) w (?:lewej|prawej) rece(?: oraz (?<weapon2>[a-z ]+?) w (?:lewej|prawej) rece)?\.$/,
        (triggerLine) => {
            const m = triggerLine.matches.matches;
            if (!m || !m.groups) return triggerLine;
            const { weapon1, weapon2 } = m.groups as { weapon1: string; weapon2?: string };
            const raw = triggerLine.toAnsiString();
            const text = triggerLine.text;
            if (!weapon2) {
                if (isMagicColored(raw, weapon1)) {
                    return triggerLine;
                }
                return colorStringInLine(triggerLine, weapon1, WEAPON_COLOR);
            }

            const firstIndex = text.indexOf(weapon1);
            const secondIndex = text.indexOf(weapon2, firstIndex + weapon1.length);
            let line: TriggerLine = triggerLine;

            if (!isMagicColored(raw, weapon2) && secondIndex > -1) {
                line = colorStringInLine(line, weapon2, WEAPON_COLOR, secondIndex);
            }

            if (!isMagicColored(raw, weapon1) && firstIndex > -1) {
                line = colorStringInLine(line, weapon1, WEAPON_COLOR, firstIndex);
            }

            return line;
        },
        tag
    );
    client.Triggers.registerTrigger(
        /^.*przypiet[yae].*?(?:pochwe|pochwy|uprzaz|temblak|temblaki).*, zawierajac[aey] (?<weapon>[a-z ]+)\.$/,
        (triggerLine) => {
            const m = triggerLine.matches.matches;
            if (!m || !m.groups) return triggerLine;
            const { weapon } = m.groups as { weapon: string };
            const raw = triggerLine.toAnsiString();
            if (isMagicColored(raw, weapon)) {
                return triggerLine;
            }
            return colorStringInLine(triggerLine, weapon, WEAPON_COLOR);
        },
        tag
    );
    client.Triggers.registerTrigger(
        /^.*przypiet[yae].*?(?:pochwe|pochwy|uprzaz|temblak|temblaki).* z tkwiac.* w (?:niej|nim|nich) (?<weapon>[a-z ]+)\.$/,
        (triggerLine) => {
            const m = triggerLine.matches.matches;
            if (!m || !m.groups) return triggerLine;
            const { weapon } = m.groups as { weapon: string };
            const raw = triggerLine.toAnsiString();
            if (isMagicColored(raw, weapon)) {
                return triggerLine;
            }
            return colorStringInLine(triggerLine, weapon, WEAPON_COLOR);
        },
        tag
    );
}
