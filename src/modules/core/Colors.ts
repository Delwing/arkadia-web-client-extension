import xtermArkadia from "@client/xtermArkadia";
import xtermProper from "@client/xtermProper";
import { getItemSync } from "./storage";
import TriggerLine from "@client/triggers/TriggerLine";
import {AnsiAwareBuffer, FormatStateSnapshot, HexColor} from "@client/ansi/FormatState.ts";

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
    return new AnsiAwareBuffer(string).colorWords(string, colorCode);
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
    triggerLine: TriggerLine,
    string: string,
    colorCode: number,
    startIndex = 0,
): TriggerLine {
    const haystack = triggerLine.text.toLowerCase();
    const needle = string.toLowerCase();
    const matchIndex = haystack.indexOf(needle, startIndex);
    if (matchIndex === -1) {
        return triggerLine;
    }
    const endIndex = matchIndex + string.length;
    return triggerLine.color([matchIndex, endIndex], colorCode);
}

//TODO usage should be replaced by something, yet to be decided what
export function findClosestColor(hex: string | number[]): FormatStateSnapshot {
    return {
        foreground: { space: "hex", color: hex } as HexColor
    }
}

export function mudletColorLine(line: string) {
    return new AnsiAwareBuffer(line);
    //TODO build buffer from lines like <tomato>Tomato colored<reset>no color<sky_blue>blue colored
}

export const Colors = {
    color,
    colorString,
    colorStringInLine,
    findClosestColor,
    mudletColorLine,
}
