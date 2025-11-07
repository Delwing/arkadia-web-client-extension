// ANSI color table for terminal color rendering
import {colorCodes} from "@modules/core/Colors";


/**
 * Handle color change in ANSI parsing
 */
function handleColorChange(
    palette: string[],
    activeColors: string[],
    spanStartIndices: number[],
    spanEndIndices: number[],
    currentSpanCount: number,
    matchPos: number,
    colorIndex: number
): void {
    if (spanStartIndices.length > currentSpanCount) {
        if (spanStartIndices[currentSpanCount] <= matchPos - 1) {
            spanEndIndices[currentSpanCount] = matchPos - 1;
        } else {
            activeColors.splice(currentSpanCount, 1);
            spanStartIndices.splice(currentSpanCount, 1);
        }
    }

    if (colorIndex >= 0 && colorIndex < palette.length) {
        activeColors.push(palette[colorIndex]);
        spanStartIndices.push(matchPos);
    }
}

/**
 * Apply color spans to the output string
 */
function applyColorSpans(
    output: string,
    activeColors: string[],
    spanStartIndices: number[],
    spanEndIndices: number[]
): string {
    // Sort spans by end index descending so inserting HTML doesn't shift indexes
    const spanIndices = spanEndIndices.map((_, i) => i);
    spanIndices.sort((a, b) => spanEndIndices[b] - spanEndIndices[a]);

    for (const index of spanIndices) {
        const start = spanStartIndices[index];
        const end = spanEndIndices[index];
        const color = activeColors[index];
        const content = output.slice(start, end + 1);

        if (content && color) {
            const span = `<span style="color: ${color}">${content}</span>`;
            output = output.slice(0, start) + span + output.slice(end + 1);
        }
    }

    return output;
}

/**
 * Parse ANSI color patterns and convert them to HTML spans
 */
export function parseAnsiPatterns(input: string): string {
    const activeColors: string[] = [];
    const spanStartIndices: number[] = [];
    const spanEndIndices: number[] = [];
    let offset = 0;
    let output = input;

    const ansiRegex = /\x1B\[([0-9]+(?:;[0-9]+)*)m/g;

    for (let match; match = ansiRegex.exec(input);) {
        const ansiSequence = match[1];
        const currentSpanCount = spanEndIndices.length;
        const matchPos = match.index + offset;

        if (ansiSequence === "0" || ansiSequence === "39;22") {
            // Reset or end color sequence
            if (spanStartIndices.length > currentSpanCount) {
                if (spanStartIndices[currentSpanCount] <= matchPos - 1) {
                    spanEndIndices[currentSpanCount] = matchPos - 1;
                } else {
                    activeColors.splice(currentSpanCount, 1);
                    spanStartIndices.splice(currentSpanCount, 1);
                }
            }
        } else if (ansiSequence.startsWith("22;38;5;")) {
            // 256-color mode
            const colorIndex = parseInt(ansiSequence.slice(8), 10);
            handleColorChange(colorCodes.xterm, activeColors, spanStartIndices, spanEndIndices, currentSpanCount, matchPos, colorIndex - 1);
        } else if (ansiSequence.startsWith("22;")) {
            // Standard color mode
            const colorIndex = parseInt(ansiSequence.slice(3), 10) - 30;
            handleColorChange(colorCodes.ansi.dark, activeColors, spanStartIndices, spanEndIndices, currentSpanCount, matchPos, colorIndex);
        } else if (ansiSequence.endsWith(";1")) {
            // Bold color mode
            const colorIndex = parseInt(ansiSequence.slice(0, -2), 10) - 30;
            handleColorChange(colorCodes.ansi.bright, activeColors, spanStartIndices, spanEndIndices, currentSpanCount, matchPos, colorIndex);
        }

        // Remove the ANSI sequence from the string
        output = output.slice(0, matchPos) + output.slice(matchPos + match[0].length);
        offset -= match[0].length;
    }

    // Close any remaining open spans
    if (spanStartIndices.length > spanEndIndices.length) {
        spanEndIndices.push(output.length);
    }

    return applyColorSpans(output, activeColors, spanStartIndices, spanEndIndices);
}