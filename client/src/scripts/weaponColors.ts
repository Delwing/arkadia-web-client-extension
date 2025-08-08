import Client from "../Client";
import { colorStringInLine, findClosestColor, color, RESET } from "../Colors";
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
        (raw, _line, m) => {
            const weapon = m.groups!.weapon1;
            if (isMagicColored(raw, weapon)) {
                return raw;
            }
            return colorStringInLine(raw, weapon, WEAPON_COLOR);
        },
        tag
    );
    client.Triggers.registerTrigger(
        /^Trzyma(?:sz)? (?<weapon1>[a-z ]+?) w (?:lewej|prawej) rece(?: oraz (?<weapon2>[a-z ]+?) w (?:lewej|prawej) rece)?\.$/,
        (raw, _line, m) => {
            const { weapon1, weapon2 } = m.groups as { weapon1: string; weapon2?: string };
            if (!weapon2) {
                if (isMagicColored(raw, weapon1)) {
                    return raw;
                }
                return colorStringInLine(raw, weapon1, WEAPON_COLOR);
            }

            const firstIndex = raw.indexOf(weapon1);
            const secondIndex = raw.indexOf(weapon2, firstIndex + weapon1.length);
            let line = raw;

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
        /^.*przypiet(?:y|a|e).*?(?:pochwe|pochwy|uprzaz|temblak|temblaki).*, zawierajac(?:a|e|y) (?<weapon>[a-z ]+)\.$/,
        (raw, _line, m) => {
            const { weapon } = m.groups as { weapon: string };
            if (isMagicColored(raw, weapon)) {
                return raw;
            }
            return colorStringInLine(raw, weapon, WEAPON_COLOR);
        },
        tag
    );
    client.Triggers.registerTrigger(
        /^.*przypiet(?:y|a|e).*?(?:pochwe|pochwy|uprzaz|temblak|temblaki).* z tkwiac.* w (?:niej|nim|nich) (?<weapon>[a-z ]+)\.$/,
        (raw, _line, m) => {
            const { weapon } = m.groups as { weapon: string };
            if (isMagicColored(raw, weapon)) {
                return raw;
            }
            return colorStringInLine(raw, weapon, WEAPON_COLOR);
        },
        tag
    );
}
