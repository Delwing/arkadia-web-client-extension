import xtermArkadia from "@client/xtermArkadia";
import xtermProper from "@client/xtermProper";
import {getItemSync} from "./storage";
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
    } catch {
    }
    return 'arkadia';
})();
colorCodes.xterm = palette === 'proper' ? colorCodes.xtermProper : colorCodes.xtermArkadia;

export function setXtermPalette(p: 'arkadia' | 'proper') {
    colorCodes.xterm = p === 'proper' ? colorCodes.xtermProper : colorCodes.xtermArkadia;
}

export const RESET = '\x1B[0m'

export function color(colorCode: number) {
    return `\x1B[22;38;5;${colorCode}m`
}

export function colorString(string: string, colorCode: number | FormatStateSnapshot): AnsiAwareBuffer {
    return new AnsiAwareBuffer(string).colorWords(string, colorCode);
}

export function colorStringInLine(
    buffer: AnsiAwareBuffer,
    string: string,
    formatting: FormatStateSnapshot,
    startIndex = 0,
): AnsiAwareBuffer {
    const matchIndex = buffer.text.indexOf(string, startIndex);
    if (matchIndex === -1) {
        return buffer;
    }
    return buffer.color([matchIndex, matchIndex + string.length], formatting);
}

export function colorTokenInLine(
    buffer: AnsiAwareBuffer,
    string: string,
    colorCode: FormatStateSnapshot,
    startIndex = 0,
): AnsiAwareBuffer {
    const haystack = buffer.text.toLowerCase();
    const needle = string.toLowerCase();
    const matchIndex = haystack.indexOf(needle, startIndex);
    if (matchIndex === -1) {
        return buffer;
    }
    const endIndex = matchIndex + string.length;
    return buffer.color([matchIndex, endIndex], colorCode);
}

//TODO usage should be replaced by something, yet to be decided what
export function findClosestColor(hex: string | number[]): FormatStateSnapshot {
    return {
        foreground: {space: "hex", color: hex} as HexColor
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
