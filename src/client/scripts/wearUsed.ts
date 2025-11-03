import Client from "../Client";
import {colorString, findClosestColor} from "@modules/core/Colors";

const COLORS: Record<string, number> = {
    green: findClosestColor("#00ff00"),
    yellow: findClosestColor("#ffff00"),
    red: findClosestColor("#ff0000"),
};

const WEAR_USED_DESC: Record<string, number> = {
    "calkiem nowy.": 5,
    "calkiem nowe.": 5,
    "calkiem nowa.": 5,
    "w miare nowy.": 4,
    "w miare nowe.": 4,
    "w miare nowa.": 4,
    "troche zuzyty.": 3,
    "troche znoszone.": 3,
    "troche znoszona.": 3,
    "w duzym stopniu zuzyty": 2,
    "prawie calkiem znoszone.": 2,
    "prawie calkiem znoszona.": 2,
    "kompletnie zuzyty": 1,
    "gotowe rozpasc sie w kazdej chwili.": 1,
    "gotowa rozpasc sie w kazdej chwili.": 1,
};

export function colorForWear(value: number): string {
    if (value >= 4) return "green";
    if (value === 3) return "yellow";
    return "red";
}

export function getWearValue(desc: string): number | undefined {
    const key = desc.toLowerCase();
    const value = WEAR_USED_DESC[key];
    if (value == null) {
        return undefined;
    }
    return Math.max(1, Math.min(value, 5));
}

export function processWearUsed(rawLine: string, desc: string): string {
    const clampedValue = getWearValue(desc);
    if (clampedValue == null) return rawLine;
    const formattedValue = `[${clampedValue}/5]`;
    const colorName = colorForWear(clampedValue);
    const colorCode = COLORS[colorName] ?? COLORS.red;
    const coloredDesc = colorString(desc, colorCode);
    const coloredValue = colorString(formattedValue, colorCode);
    return rawLine.replace(desc, `${coloredDesc} ${coloredValue}`);
}

export default function initWearUsed(client: Client) {
    const patterns = [
        /^Ubranie to.* wyglada na (.*)$/,
        /^Ten element ekwipunku wyglada na (.*)$/
    ];
    client.Triggers.registerTrigger(patterns, (raw, _line, m) => {
        const desc = m[1];
        return processWearUsed(raw, desc);
    }, "wear-used");
}
