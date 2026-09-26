import {colorString} from "@modules/core/Colors";
import {AnsiAwareBuffer, FormatStateSnapshot} from "@client/ansi/FormatState";

export function createPad(width: number, left: number, right: number) {
    const contentWidth = width - left - right;
    return (content?: AnsiAwareBuffer): AnsiAwareBuffer => {
        const line = new AnsiAwareBuffer("|");
        line.append(" ".repeat(left), {});

        if (content) {
            if (content.length > contentWidth) {
                const truncated = new AnsiAwareBuffer();
                const segments = content.getSegments();
                let remaining = contentWidth;
                for (const segment of segments) {
                    if (remaining <= 0) break;
                    if (segment.text.length <= remaining) {
                        truncated.append(segment.text, segment.state);
                        remaining -= segment.text.length;
                    } else {
                        truncated.append(segment.text.slice(0, remaining), segment.state);
                        remaining = 0;
                    }
                }
                line.appendBuffer(truncated);
            } else {
                line.appendBuffer(content);
                line.append(" ".repeat(contentWidth - content.length));
            }
        } else {
            line.append(" ".repeat(contentWidth), {});
        }

        line.append(" ".repeat(right), {});
        line.append("|");
        return line;
    };
}

export function createHeader(width: number, offset: number, color: FormatStateSnapshot) {
    return (title: string): AnsiAwareBuffer => {
        const line = new AnsiAwareBuffer("+");
        const dashes = width - title.length - offset;
        const left = Math.floor(dashes / 2);
        const right = dashes - left;
        line.append("-".repeat(left));
        line.append(" ");
        line.appendBuffer(colorString(title, color));
        line.append(" ");
        line.append("-".repeat(right), {});
        line.append("+");
        return line;
    };
}

/**
 * Greedily packs pieces into lines no wider than `width`, joining pieces on a
 * line with `separator`. Continuation lines are indented by `indent` spaces.
 * Lets a table row flow onto several lines when the console is narrow.
 */
export function wrapPieces(pieces: AnsiAwareBuffer[], separator: string, width: number, indent = 0): AnsiAwareBuffer[] {
    const lines: AnsiAwareBuffer[] = [];
    let current: AnsiAwareBuffer | null = null;
    for (const piece of pieces) {
        if (current && current.length + separator.length + piece.length <= width) {
            current.append(separator, {});
            current.appendBuffer(piece);
            continue;
        }
        if (current) {
            lines.push(current);
            current = new AnsiAwareBuffer();
            current.append(" ".repeat(indent), {});
        } else {
            current = new AnsiAwareBuffer();
        }
        current.appendBuffer(piece);
    }
    if (current) lines.push(current);
    return lines;
}
