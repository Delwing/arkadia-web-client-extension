import xtermArkadia from "./xtermArkadia";
import xtermProper from "./xtermProper";
import mudletColors from "./colors.json";
import { getItemSync } from "./storage";
import TriggerLine from "./triggers/TriggerLine";

function hexToRgb(hex: string): [number, number, number] {
    const value = parseInt(hex.replace(/^#/, ''), 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

export const colorCodes = {
    xtermArkadia,
    xtermProper,
    xterm: [] as string[],
    ansi: {
        bright: ["#555555", "#ff5555", "#55ff55", "#ffff55", "#5555ff", "#ff55ff", "#55ffff", "#ffffff"],
        dark: ["#000000", "#bb0000", "#00bb00", "#bbbb00", "#0000bb", "#bb00bb", "#00bbbb", "#bbbbbb"]
    }
}

const palette = (() => {
    try {
        const ui = getItemSync('uiSettings');
        const raw = ui?.uiSettings;
        if (raw) {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return parsed.xtermPalette === 'proper' ? 'proper' : 'arkadia';
        }
    } catch {}
    return 'arkadia';
})();
colorCodes.xterm = palette === 'proper' ? colorCodes.xtermProper : colorCodes.xtermArkadia;

export function setXtermPalette(p: 'arkadia' | 'proper') {
    colorCodes.xterm = p === 'proper' ? colorCodes.xtermProper : colorCodes.xtermArkadia;
}

export const RESET = '\x1B[0m'

export function color(colorCode:number) {
    return `\x1B[22;38;5;${colorCode}m`
}

export function colorString(string: string, colorCode: number) {
    return color(colorCode) + string + RESET;
}

export function colorStringInLine(
    rawLine: TriggerLine | string,
    string: string,
    colorCode: number,
    startIndex = 0,
): TriggerLine {
    const triggerLine = rawLine instanceof TriggerLine ? rawLine : new TriggerLine(rawLine);
    const text = triggerLine.text;
    const matchIndex = text.indexOf(string, startIndex);
    if (matchIndex === -1) {
        return triggerLine;
    }
    return triggerLine.color([matchIndex, matchIndex + string.length], colorCode);
}

export function colorTokenInLine(
    rawLine: TriggerLine | string,
    string: string,
    colorCode: number,
    startIndex = 0,
): TriggerLine {
    const triggerLine = rawLine instanceof TriggerLine ? rawLine : new TriggerLine(rawLine);
    const haystack = triggerLine.text.toLowerCase();
    const needle = string.toLowerCase();
    const matchIndex = haystack.indexOf(needle, startIndex);
    if (matchIndex === -1) {
        return triggerLine;
    }
    const endIndex = matchIndex + string.length;
    return triggerLine.color([matchIndex, endIndex], colorCode);
}

export function findClosestColor(hex: string | number[]): number {
    const targetRgb = Array.isArray(hex) ? hex : hexToRgb(hex)
    let distance = 99999999999999
    let currentPick: number = 0;
    colorCodes.xterm.forEach((colorsKey, index) => {
        const rgb = hexToRgb(colorsKey)
        const compDistance = Math.pow(targetRgb[0] - rgb[0], 2) + Math.pow(targetRgb[1] - rgb[1], 2) + Math.pow(targetRgb[2] - rgb[2], 2)
        if (compDistance < distance) {
            currentPick = index
            distance = compDistance
        }
    })
    return currentPick + 1
}

export function mudletColorLine(line: string) {
    return line.replace(/<(.+?)>/g, (substring => {
        const stringColor = substring.substring(1, substring.length - 1)
        if (stringColor === "reset") {
            return RESET
        } else {
            return color(findClosestColor(mudletColors[stringColor] ?? stringColor.split(",")))
        }
    }));
}

export const Colors = {
    color,
    colorString,
    colorStringInLine,
    findClosestColor,
    mudletColorLine,
}
