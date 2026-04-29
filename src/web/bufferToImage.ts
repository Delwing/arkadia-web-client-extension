import {AnsiAwareBuffer, FormatColor} from "@client/ansi/FormatState";
import {colorCodes} from "@modules/core/Colors";
import {copyCanvasToClipboard} from "@shared/dom/copyCanvasToClipboard.ts";

export interface BufferToImageOptions {
    /** Background color (default: from output window) */
    backgroundColor?: string;
    /** Font family (default: from output window) */
    fontFamily?: string;
    /** Font size in pixels (default: from output window) */
    fontSize?: number;
    /** Line height multiplier (default: 1.4) */
    lineHeight?: number;
    /** Padding in pixels (default: 16) */
    padding?: number;
    /** Default text color (default: from output window) */
    defaultColor?: string;
    /** Scale factor for high DPI (default: 2) */
    scale?: number;
}

function getOutputWindowStyles(): { backgroundColor: string; fontFamily: string; fontSize: number; defaultColor: string } {
    const outputWrapper = document.getElementById('main_text_output_msg_wrapper');
    const computedStyle = outputWrapper ? window.getComputedStyle(outputWrapper) : null;
    const bodyStyle = window.getComputedStyle(document.body);

    return {
        backgroundColor: outputWrapper?.style.backgroundColor || '#242424',
        fontFamily: computedStyle?.fontFamily || 'monospace',
        fontSize: computedStyle ? parseFloat(computedStyle.fontSize) : 14,
        defaultColor: bodyStyle.color || '#f1f5f9',
    };
}

type UnderlineStyle = 'solid' | 'dotted';

interface StyledSegment {
    text: string;
    color: string;
    backgroundColor?: string;
    bold: boolean;
    underline?: UnderlineStyle;
}

function colorToHex(color: FormatColor): string {
    if (color.space === "hex") {
        return color.color;
    }
    if (color.space === "rgb") {
        const r = color.r.toString(16).padStart(2, "0");
        const g = color.g.toString(16).padStart(2, "0");
        const b = color.b.toString(16).padStart(2, "0");
        return `#${r}${g}${b}`;
    }
    if (color.space === "indexed") {
        return colorCodes.xterm[color.index] || "#000000";
    }
    return "#000000";
}

function bufferToCanvas(
    buffer: AnsiAwareBuffer,
    options: BufferToImageOptions = {}
): HTMLCanvasElement {
    const outputStyles = getOutputWindowStyles();
    const {
        backgroundColor = outputStyles.backgroundColor,
        fontFamily = outputStyles.fontFamily,
        fontSize = outputStyles.fontSize,
        lineHeight = 1.4,
        padding = 16,
        defaultColor = outputStyles.defaultColor,
        scale = 2,
    } = options;

    const font = `${fontSize}px ${fontFamily}`;
    const boldFont = `bold ${fontSize}px ${fontFamily}`;

    // Extract segments with styling
    const segments = buffer.getSegments();
    const styledSegments: StyledSegment[] = [];

    for (const segment of segments) {
        const state = segment.state;
        let color = defaultColor;
        let bgColor: string | undefined;
        let bold = false;

        if (state) {
            // Handle inverse (swaps foreground and background)
            const fg = state.inverse ? state.background : state.foreground;
            const bg = state.inverse ? state.foreground : state.background;
            if (fg) {
                color = colorToHex(fg);
            }
            if (bg) {
                bgColor = colorToHex(bg);
            }
            bold = !!state.bold;
        }

        let underline: UnderlineStyle | undefined;
        if (state?.hyperlink) {
            underline = 'dotted';
        } else if (state?.underline) {
            underline = 'solid';
        }

        styledSegments.push({text: segment.text, color, backgroundColor: bgColor, bold, underline});
    }

    // Split into lines
    const lines: StyledSegment[][] = [];
    let currentLine: StyledSegment[] = [];

    for (const segment of styledSegments) {
        const parts = segment.text.split('\n');
        for (let i = 0; i < parts.length; i++) {
            if (i > 0) {
                lines.push(currentLine);
                currentLine = [];
            }
            if (parts[i]) {
                currentLine.push({text: parts[i], color: segment.color, backgroundColor: segment.backgroundColor, bold: segment.bold, underline: segment.underline});
            }
        }
    }
    if (currentLine.length > 0) {
        lines.push(currentLine);
    }

    // Create canvas and measure text
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Measure max line width
    let maxLineWidth = 0;
    for (const line of lines) {
        let lineWidth = 0;
        for (const segment of line) {
            ctx.font = segment.bold ? boldFont : font;
            lineWidth += ctx.measureText(segment.text).width;
        }
        maxLineWidth = Math.max(maxLineWidth, lineWidth);
    }

    const lineHeightPx = fontSize * lineHeight;
    const width = Math.max(200, maxLineWidth + padding * 2);
    const height = padding * 2 + lines.length * lineHeightPx;

    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.scale(scale, scale);

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    ctx.textBaseline = 'top';

    // Render each line
    for (let i = 0; i < lines.length; i++) {
        const y = padding + i * lineHeightPx + (lineHeightPx - fontSize) / 2;
        let x = padding;

        for (const segment of lines[i]) {
            ctx.font = segment.bold ? boldFont : font;
            const textWidth = ctx.measureText(segment.text).width;

            if (segment.backgroundColor) {
                ctx.fillStyle = segment.backgroundColor;
                ctx.fillRect(x, y - 2, textWidth, fontSize + 2);
            }

            ctx.fillStyle = segment.color;
            ctx.fillText(segment.text, x, y);

            if (segment.underline) {
                ctx.strokeStyle = segment.color;
                ctx.lineWidth = 1;
                const underlineY = y + fontSize + 1;
                ctx.beginPath();
                if (segment.underline === 'dotted') {
                    ctx.setLineDash([2, 2]);
                }
                ctx.moveTo(x, underlineY);
                ctx.lineTo(x + textWidth, underlineY);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            x += textWidth;
        }
    }

    return canvas;
}

/**
 * Converts an AnsiAwareBuffer to a PNG image blob.
 */
export function bufferToImage(
    buffer: AnsiAwareBuffer,
    options: BufferToImageOptions = {}
): Promise<Blob> {
    const canvas = bufferToCanvas(buffer, options);
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to create image blob'));
                }
            },
            'image/png'
        );
    });
}

/**
 * Converts an AnsiAwareBuffer to a PNG image and copies it to clipboard.
 */
export function copyBufferAsImage(
    buffer: AnsiAwareBuffer,
    options: BufferToImageOptions = {}
): Promise<void> {
    const canvas = bufferToCanvas(buffer, options);
    return copyCanvasToClipboard(canvas);
}
