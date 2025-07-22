import xtermArkadia from "./xtermArkadia";
import xtermProper from "./xtermProper";
import mudletColors from "./colors.json";

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
        const raw = localStorage.getItem('settings');
        if (raw) {
            const parsed = JSON.parse(raw);
            return parsed.xtermPalette === 'proper' ? 'proper' : 'arkadia';
        }
    } catch {}
    return 'arkadia';
})();
colorCodes.xterm = palette === 'proper' ? colorCodes.xtermProper : colorCodes.xtermArkadia;

export function setXtermPalette(p: 'arkadia' | 'proper') {
    console.log('Setting xterm palette to', p);
    colorCodes.xterm = p === 'proper' ? colorCodes.xtermProper : colorCodes.xtermArkadia;
}

export const RESET = '\x1B[0m'

export function color(colorCode:number) {
    return `\x1B[22;38;5;${colorCode}m`
}

export function colorString(string: string, colorCode: number) {
    return color(colorCode) + string + RESET;
}

export function colorStringInLine(rawLine: string, string: string, colorCode: number) {
    const matchIndex = rawLine.indexOf(string)
    if (matchIndex === -1) {
        return rawLine
    }
    return rawLine.substring(0, matchIndex) + color(colorCode) + string + RESET + rawLine.substring(matchIndex + string.length)
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
    return line.replace(/<(.+)>/g, (substring => {
        const stringColor = substring.substring(1, substring.length - 1)
        if (stringColor === "reset") {
            return RESET
        } else {
            return color(findClosestColor(mudletColors[stringColor] ?? stringColor.split(",")))
        }
    }));
}