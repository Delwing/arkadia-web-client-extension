import xtermArkadia from "@client/xtermArkadia";
import xtermProper from "@client/xtermProper";
import {getRenderSettings} from "./settings";
import {AnsiAwareBuffer, FormatStateSnapshot, FormatColor, HexColor, RgbColor} from "@client/ansi/FormatState.ts";
import mudletColors from "@client/colors.json";

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
        return getRenderSettings().xtermPalette === 'proper' ? 'proper' : 'arkadia';
    } catch {
    }
    return 'arkadia';
})();
colorCodes.xterm = palette === 'proper' ? colorCodes.xtermProper : colorCodes.xtermArkadia;

export function setXtermPalette(p: 'arkadia' | 'proper') {
    colorCodes.xterm = p === 'proper' ? colorCodes.xtermProper : colorCodes.xtermArkadia;
}

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
    return buffer.applyFormat([matchIndex, matchIndex + string.length], formatting);
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
    return buffer.applyFormat([matchIndex, endIndex], colorCode);
}

export function createColorFormat(hex: string | number[]): FormatStateSnapshot {
    if (typeof hex === "string") {
        return {
            foreground: {space: "hex", color: hex} as HexColor
        }
    }
    return {
        foreground: {space: "rgb", r: hex[0], g: hex[1] , b: hex[2]} as RgbColor
    }

}

// Create a mapping of Mudlet color names to FormatColor objects
const MUDLET_COLORS: Record<string, FormatColor> = Object.fromEntries(
    Object.entries(mudletColors).map(([name, rgb]) => {
        // Handle transparent color with alpha channel
        if (rgb.length === 4) {
            return [name, { space: 'rgb', r: rgb[0], g: rgb[1], b: rgb[2] } as RgbColor];
        }
        return [name, { space: 'rgb', r: rgb[0], g: rgb[1], b: rgb[2] } as RgbColor];
    })
);

interface ParsedTag {
    type: 'fg' | 'bg' | 'reset';
    color?: FormatColor;
}

function parseMudletTag(tagName: string): ParsedTag | null {
    if (tagName === 'reset') {
        return { type: 'reset' };
    }

    // Handle background: <bg:red>
    if (tagName.startsWith('bg:')) {
        const colorName = tagName.substring(3);
        const color = MUDLET_COLORS[colorName.toLowerCase()];
        return color ? { type: 'bg', color } : null;
    }

    // Handle foreground: <red>, <tomato>, etc.
    const color = MUDLET_COLORS[tagName.toLowerCase()];
    return color ? { type: 'fg', color } : null;
}

export function mudletColorLine(line: string): AnsiAwareBuffer {
    const buffer = new AnsiAwareBuffer();

    const tagPattern = /<([a-z_:]+)>/gi;
    let lastIndex = 0;
    let currentState: FormatStateSnapshot | undefined = undefined; // Default = no formatting
    let match: RegExpExecArray | null;

    tagPattern.lastIndex = 0;
    while ((match = tagPattern.exec(line)) !== null) {
        const tagName = match[1].toLowerCase();
        const tagPosition = match.index;

        // Append text before this tag with current state
        if (tagPosition > lastIndex) {
            const text = line.substring(lastIndex, tagPosition);
            buffer.append(text, currentState);
        }

        // Update state based on tag
        if (tagName === 'reset') {
            currentState = undefined; // Reset to plain text (line default)
        } else {
            const parsed = parseMudletTag(tagName);
            if (parsed && parsed.type !== 'reset') {
                currentState = {
                    ...(parsed.type === 'fg' ? { foreground: parsed.color } : {}),
                    ...(parsed.type === 'bg' ? { background: parsed.color } : {})
                };
            }
        }

        lastIndex = tagPattern.lastIndex;
    }

    // Append remaining text
    if (lastIndex < line.length) {
        buffer.append(line.substring(lastIndex), currentState);
    }

    return buffer;
}

export const Colors = {
    color,
    colorString,
    colorStringInLine,
    createColorFormat,
    mudletColorLine,
}
