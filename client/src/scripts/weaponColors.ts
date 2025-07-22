import Client from "../Client";
import { colorStringInLine, findClosestColor } from "../Colors";

export const WEAPON_COLOR = findClosestColor("#ffff00");

export default function initWeaponColors(client: Client) {
    const tag = "weaponColors";
    client.Triggers.registerTrigger(
        /^Trzyma(?:sz)? oburacz (?<weapon1>[a-z ]+)\.$/,
        (raw, _line, m) => colorStringInLine(raw, m.groups!.weapon1, WEAPON_COLOR),
        tag
    );
    client.Triggers.registerTrigger(
        /^Trzyma(?:sz)? (?<weapon1>[a-z ]+?) w (?:lewej|prawej) rece(?: oraz (?<weapon2>[a-z ]+?) w (?:lewej|prawej) rece)?\.$/,
        (raw, _line, m) => {
            let line = colorStringInLine(raw, m.groups!.weapon1, WEAPON_COLOR);
            if (m.groups!.weapon2) {
                line = colorStringInLine(line, m.groups!.weapon2, WEAPON_COLOR);
            }
            return line;
        },
        tag
    );
}
