import Client from "../Client";
import {colorStringInLine, findClosestColor} from "@modules/core/Colors";
import {AnsiAwareBuffer, HexColor} from "../ansi/FormatState";
import {MAGICS_COLOR} from "../constants/colors";

export const WEAPON_COLOR = findClosestColor("#ffff00");

function isMagicColored(line: AnsiAwareBuffer, weapon: string, index: number = 0): boolean {
    const weaponIndex = line.text.indexOf(weapon, index)
    const color = line.getStateAt(weaponIndex)
    return color.foreground.space === "hex" && color.foreground.color == (MAGICS_COLOR.foreground as HexColor).color
}

export default function initWeaponColors(client: Client) {
    const tag = "weaponColors";
    client.Triggers.registerTrigger(
        /^Trzyma(?:sz)? oburacz (?<weapon1>[a-z ]+)\.$/,
        (line, matches) => {
            if (!matches || !matches.groups) return line;
            const weapon = matches.groups.weapon1;
            if (isMagicColored(line, weapon)) {
                return line;
            }
            return colorStringInLine(line, weapon, WEAPON_COLOR);
        },
        tag
    );
    client.Triggers.registerTrigger(
        /^Trzyma(?:sz)? (?<weapon1>[a-z ]+?) w (?:lewej|prawej) rece(?: oraz (?<weapon2>[a-z ]+?) w (?:lewej|prawej) rece)?\.$/,
        (line, matches) => {
            if (!matches || !matches.groups) return line;
            const {weapon1, weapon2} = matches.groups as { weapon1: string; weapon2?: string };
            const text = line.text;
            if (!weapon2) {
                if (isMagicColored(line, weapon1)) {
                    return line;
                }
                return colorStringInLine(line, weapon1, WEAPON_COLOR);
            }

            const firstIndex = text.indexOf(weapon1);
            const secondIndex = text.indexOf(weapon2, firstIndex + weapon1.length);
            let buffer: AnsiAwareBuffer = line;

            if (!isMagicColored(line, weapon2, secondIndex) && secondIndex > -1) {
                buffer = colorStringInLine(buffer, weapon2, WEAPON_COLOR, secondIndex);
            }

            if (!isMagicColored(line, weapon1, firstIndex) && firstIndex > -1) {
                buffer = colorStringInLine(buffer, weapon1, WEAPON_COLOR, firstIndex);
            }

            return buffer;
        },
        tag
    );
    client.Triggers.registerTrigger(
        /^.*przypiet[yae].*?(?:pochwe|pochwy|uprzaz|temblak|temblaki).*, zawierajac[aey] (?<weapon>[a-z ]+)\.$/,
        (line, matches) => {
            if (!matches || !matches.groups) return line;
            const {weapon} = matches.groups as { weapon: string };
            if (isMagicColored(line, weapon)) {
                return line;
            }
            return colorStringInLine(line, weapon, WEAPON_COLOR);
        },
        tag
    );
    client.Triggers.registerTrigger(
        /^.*przypiet[yae].*?(?:pochwe|pochwy|uprzaz|temblak|temblaki).* z tkwiac.* w (?:niej|nim|nich) (?<weapon>[a-z ]+)\.$/,
        (line, matches) => {
            if (!matches || !matches.groups) return line;
            const {weapon} = matches.groups as { weapon: string };
            if (isMagicColored(line, weapon)) {
                return line;
            }
            return colorStringInLine(line, weapon, WEAPON_COLOR);
        },
        tag
    );
}
