import {areOutputTimestampsVisible, areOutputMessageTypesVisible} from "@shared/dom/outputMessageHandler";
import {copyCanvasToClipboard} from "@shared/dom/copyCanvasToClipboard.ts";

type UnderlineStyle = 'solid' | 'dotted';

interface StyledSpan {
    text: string;
    color: string;
    backgroundColor?: string;
    bold: boolean;
    underline?: UnderlineStyle;
}

const BLOCK_ELEMENTS = new Set([
    'DIV', 'P', 'BR', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'BLOCKQUOTE', 'PRE', 'HR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
]);

const TIMESTAMP_COLOR = 'darkorange';
const MESSAGE_TYPE_COLOR = 'mediumpurple';

function extractStyledText(node: Node, defaultColor: string, includeTimestamps: boolean, includeMessageTypes: boolean): StyledSpan[] {
    const spans: StyledSpan[] = [];

    function walk(n: Node, inheritedColor: string, inheritedBgColor: string | undefined, inheritedBold: boolean, inheritedUnderline: UnderlineStyle | undefined) {
        if (n.nodeType === Node.TEXT_NODE) {
            const text = n.textContent || '';
            if (text) {
                spans.push({ text, color: inheritedColor, backgroundColor: inheritedBgColor, bold: inheritedBold, underline: inheritedUnderline });
            }
            return;
        }

        if (n.nodeType === Node.ELEMENT_NODE) {
            const el = n as HTMLElement;
            if (el.classList.contains('output-timestamp')) {
                if (includeTimestamps) {
                    const text = el.textContent || '';
                    if (text) {
                        spans.push({ text: text + ' ', color: TIMESTAMP_COLOR, backgroundColor: undefined, bold: false });
                    }
                }
                return;
            }

            if (el.classList.contains('output-message-type')) {
                if (includeMessageTypes) {
                    const text = el.textContent || '';
                    if (text) {
                        const truncated = text.length > 12 ? text.substring(0, 12) : text.padEnd(12, ' ');
                        spans.push({ text: truncated + ' ', color: MESSAGE_TYPE_COLOR, backgroundColor: undefined, bold: false });
                    }
                }
                return;
            }

            const tagName = el.tagName;
            const isBlock = BLOCK_ELEMENTS.has(tagName);

            // Only use inline style.color - don't use computed style for color
            // because the cloned content loses its original context
            let color = inheritedColor;
            if (el.style.color) {
                color = el.style.color;
            }

            let bgColor = inheritedBgColor;
            if (el.style.backgroundColor) {
                bgColor = el.style.backgroundColor;
            }

            const computedStyle = window.getComputedStyle(el);
            const bold = inheritedBold || computedStyle.fontWeight === 'bold' || parseInt(computedStyle.fontWeight) >= 700;
            let underline = inheritedUnderline;
            if (!underline && computedStyle.textDecorationLine.includes('underline')) {
                underline = computedStyle.textDecorationStyle === 'dotted' ? 'dotted' : 'solid';
            }

            for (const child of n.childNodes) {
                walk(child, color, bgColor, bold, underline);
            }

            if (isBlock && spans.length > 0) {
                const lastSpan = spans[spans.length - 1];
                if (!lastSpan.text.endsWith('\n')) {
                    spans.push({ text: '\n', color: inheritedColor, bold: false });
                }
            }
        }
    }

    walk(node, defaultColor, undefined, false, undefined);
    return spans;
}

function getAncestorColor(node: Node): string | null {
    let current: Node | null = node;
    while (current && current !== document.body) {
        if (current.nodeType === Node.ELEMENT_NODE) {
            const el = current as HTMLElement;
            if (el.style.color) {
                return el.style.color;
            }
        }
        current = current.parentNode;
    }
    return null;
}

function getFirstLineOffset(range: Range): number {
    // When selection spans multiple output_msg divs, the browser merges text into one node.
    // We find the offset by looking at what text precedes the selection on its first line.
    const startContainer = range.startContainer;
    const startOffset = range.startOffset;

    if (startContainer.nodeType !== Node.TEXT_NODE) {
        return 0;
    }

    const textBefore = startContainer.textContent?.substring(0, startOffset) || '';
    const lastNewlineIndex = textBefore.lastIndexOf('\n');

    // Return characters after the last newline (or all if no newline)
    return lastNewlineIndex >= 0 ? textBefore.length - lastNewlineIndex - 1 : textBefore.length;
}

function findFirstLineTimestamp(range: Range): string | null {
    // Find the output_msg element that contains the start of the selection
    let node: Node | null = range.startContainer;
    while (node && node !== document.body) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.classList.contains('output_msg')) {
                const timestampEl = el.querySelector('.output-timestamp');
                if (timestampEl) {
                    return timestampEl.textContent || null;
                }
                return null;
            }
        }
        node = node.parentNode;
    }
    return null;
}

function findFirstLineMessageType(range: Range): string | null {
    let node: Node | null = range.startContainer;
    while (node && node !== document.body) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.classList.contains('output_msg')) {
                const typeEl = el.querySelector('.output-message-type');
                if (typeEl) {
                    return typeEl.textContent || null;
                }
                return null;
            }
        }
        node = node.parentNode;
    }
    return null;
}

function getSelectedContent(): { spans: StyledSpan[]; hasSelection: boolean; firstLineCharOffset: number; prependedPrefixCount: number } {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
        return { spans: [], hasSelection: false, firstLineCharOffset: 0, prependedPrefixCount: 0 };
    }

    const range = selection.getRangeAt(0);

    // Get the character offset for the first line (before cloning)
    const firstLineCharOffset = getFirstLineOffset(range);

    // Get color from ancestors of the original selection (before cloning loses it)
    // This is ONLY for the first line's content that may have inherited color
    const ancestorColor = getAncestorColor(range.startContainer);

    const fragment = range.cloneContents();
    const container = document.createElement('div');
    container.appendChild(fragment);
    document.body.appendChild(container);

    const bodyStyle = window.getComputedStyle(document.body);
    const defaultColor = bodyStyle.color || '#ffffff';
    const includeTimestamps = areOutputTimestampsVisible();
    const includeMessageTypes = areOutputMessageTypesVisible();
    const spans = extractStyledText(container, defaultColor, includeTimestamps, includeMessageTypes);

    // Apply ancestor color only to initial consecutive default-colored spans (first line content)
    // Stop as soon as we hit a span with explicit color - that span came from
    // an element after the colored ancestor, so it and subsequent spans should keep their colors
    if (ancestorColor && spans.length > 0) {
        for (const span of spans) {
            if (span.text.includes('\n')) {
                break;
            }
            if (span.color !== defaultColor) {
                // Hit a span with explicit color, stop applying ancestor color
                break;
            }
            span.color = ancestorColor;
        }
    }

    // If timestamps/message types are visible and the first line is missing them,
    // try to find and prepend them (they have user-select: none so they're not in the selection)
    let prependedPrefixCount = 0;

    if (includeTimestamps && spans.length > 0) {
        const hasTimestampAtStart = spans[0].color === TIMESTAMP_COLOR;
        if (!hasTimestampAtStart) {
            const firstLineTimestamp = findFirstLineTimestamp(range);
            if (firstLineTimestamp) {
                spans.unshift({ text: firstLineTimestamp + ' ', color: TIMESTAMP_COLOR, bold: false });
                prependedPrefixCount++;
            }
        }
    }

    if (includeMessageTypes && spans.length > 0) {
        // Insert message type after timestamp (if present), otherwise at start
        const insertIdx = (spans[0].color === TIMESTAMP_COLOR) ? 1 : 0;
        const hasMessageTypeAt = spans.length > insertIdx && spans[insertIdx].color === MESSAGE_TYPE_COLOR;
        if (!hasMessageTypeAt) {
            const firstLineMessageType = findFirstLineMessageType(range);
            if (firstLineMessageType !== null) {
                const truncated = firstLineMessageType.length > 12 ? firstLineMessageType.substring(0, 12) : firstLineMessageType.padEnd(12, ' ');
                spans.splice(insertIdx, 0, { text: truncated + ' ', color: MESSAGE_TYPE_COLOR, bold: false });
                prependedPrefixCount++;
            }
        }
    }

    document.body.removeChild(container);
    return { spans, hasSelection: true, firstLineCharOffset, prependedPrefixCount };
}

export async function copyOutputAsImage(): Promise<void> {
    const { spans, hasSelection, firstLineCharOffset, prependedPrefixCount } = getSelectedContent();
    if (!hasSelection || spans.length === 0) {
        throw new Error('Brak zaznaczenia');
    }

    const firstLineHasPrependedPrefix = prependedPrefixCount > 0;

    const outputWrapper = document.getElementById('main_text_output_msg_wrapper');
    const bgColor = outputWrapper?.style.backgroundColor || '#242424';

    // Get computed styles from the actual content area to match rendering
    const computedStyle = outputWrapper ? window.getComputedStyle(outputWrapper) : null;
    const fontSize = computedStyle ? parseFloat(computedStyle.fontSize) : 14;
    const fontFamily = computedStyle?.fontFamily || 'monospace';
    const lineHeight = 1.4;
    const padding = 16;
    const font = `${fontSize}px ${fontFamily}`;
    const boldFont = `bold ${fontSize}px ${fontFamily}`;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Create DOM measurement element for accurate text width matching browser rendering
    // (canvas measureText differs from browser layout, causing wrapping mismatches)
    const measureSpan = document.createElement('span');
    measureSpan.style.position = 'absolute';
    measureSpan.style.visibility = 'hidden';
    measureSpan.style.whiteSpace = 'pre';
    measureSpan.style.font = font;
    document.body.appendChild(measureSpan);

    const domMeasureText = (text: string, bold: boolean): number => {
        measureSpan.style.font = bold ? boldFont : font;
        measureSpan.textContent = text;
        return measureSpan.getBoundingClientRect().width;
    };

    // Get container width for wrapping from actual content element for accuracy
    const wrapperPadding = computedStyle ? parseFloat(computedStyle.paddingLeft) + parseFloat(computedStyle.paddingRight) : 16;
    const contentEl = outputWrapper?.querySelector('.output_msg_content') as HTMLElement | null;
    const containerWidth = (contentEl?.clientWidth || (outputWrapper ? outputWrapper.clientWidth - wrapperPadding : 800)) - 8;

    // Split spans into lines (by newlines only first, then wrap)
    const logicalLines: StyledSpan[][] = [];
    let currentLine: StyledSpan[] = [];

    for (const span of spans) {
        const parts = span.text.split('\n');
        for (let i = 0; i < parts.length; i++) {
            if (i > 0) {
                logicalLines.push(currentLine);
                currentLine = [];
            }
            if (parts[i]) {
                currentLine.push({ text: parts[i], color: span.color, backgroundColor: span.backgroundColor, bold: span.bold, underline: span.underline });
            }
        }
    }
    if (currentLine.length > 0) {
        logicalLines.push(currentLine);
    }

    // Calculate first line pixel offset (only if multiple lines and first line has prepended prefix)
    // Only apply offset if we prepended prefix(es) (meaning selection started mid-content)
    const firstLinePixelOffset = (logicalLines.length > 1 && firstLineHasPrependedPrefix)
        ? domMeasureText(' '.repeat(firstLineCharOffset), false)
        : 0;

    // Check if we have any timestamps or message types — lines without them need indentation
    const hasAnyTimestamp = logicalLines.some(line => line.length > 0 && line[0].color === TIMESTAMP_COLOR);
    const hasAnyMessageType = logicalLines.some(line => {
        const afterTimestamp = (line.length > 0 && line[0].color === TIMESTAMP_COLOR) ? 1 : 0;
        return line.length > afterTimestamp && line[afterTimestamp].color === MESSAGE_TYPE_COLOR;
    });

    // Timestamp format: "HH:MM:SS.mmm " = 13 chars; message type: padded to 12 chars + space = 13 chars
    const timestampIndent = hasAnyTimestamp ? domMeasureText(' '.repeat(13), false) : 0;
    const messageTypeIndent = hasAnyMessageType ? domMeasureText(' '.repeat(13), false) : 0;
    const totalPrefixIndent = timestampIndent + messageTypeIndent;

    // Wrap lines to fit container width
    const lines: StyledSpan[][] = [];

    for (let logicalLineIndex = 0; logicalLineIndex < logicalLines.length; logicalLineIndex++) {
        const logicalLine = logicalLines[logicalLineIndex];
        const lineHasPrefix = logicalLine.length > 0 && (logicalLine[0].color === TIMESTAMP_COLOR || logicalLine[0].color === MESSAGE_TYPE_COLOR);

        // Calculate initial offset for this logical line
        let initialOffset: number;
        if (logicalLineIndex === 0 && firstLineHasPrependedPrefix) {
            initialOffset = 0; // Prefix will be rendered first, offset applied after
        } else if (!lineHasPrefix && totalPrefixIndent > 0) {
            initialOffset = totalPrefixIndent;
        } else {
            initialOffset = 0;
        }

        // For first line with prepended prefix, set currentX to account for all prefix spans + offset
        let currentX = initialOffset;
        if (logicalLineIndex === 0 && firstLineHasPrependedPrefix) {
            for (let pi = 0; pi < prependedPrefixCount && pi < logicalLine.length; pi++) {
                currentX += domMeasureText(logicalLine[pi].text, false);
            }
            currentX += firstLinePixelOffset;
        }

        let wrappedLine: StyledSpan[] = [];

        for (let spanIndex = 0; spanIndex < logicalLine.length; spanIndex++) {
            const span = logicalLine[spanIndex];

            // Skip prepended prefix spans on first line — their width is already in currentX
            if (logicalLineIndex === 0 && spanIndex < prependedPrefixCount) {
                wrappedLine.push(span);
                continue;
            }

            let remainingText = span.text;

            while (remainingText.length > 0) {
                const textWidth = domMeasureText(remainingText, span.bold);

                if (currentX + textWidth <= containerWidth) {
                    // Text fits on current line
                    if (remainingText.length > 0) {
                        wrappedLine.push({ text: remainingText, color: span.color, backgroundColor: span.backgroundColor, bold: span.bold, underline: span.underline });
                    }
                    currentX += textWidth;
                    remainingText = '';
                } else {
                    // Need to wrap - binary search for how many characters fit
                    let lo = 1, hi = remainingText.length, fitChars = 0;
                    while (lo <= hi) {
                        const mid = (lo + hi) >> 1;
                        const partWidth = domMeasureText(remainingText.substring(0, mid), span.bold);
                        if (currentX + partWidth <= containerWidth) {
                            fitChars = mid;
                            lo = mid + 1;
                        } else {
                            hi = mid - 1;
                        }
                    }

                    if (fitChars === 0) {
                        // Can't fit even one character, force at least one to avoid infinite loop
                        fitChars = 1;
                    }

                    // CSS pre-wrap: trailing spaces at a line break "hang" past the edge
                    // (they don't count toward line width). Include them so the break
                    // happens after "word, " not before it.
                    while (fitChars < remainingText.length && remainingText[fitChars] === ' ') {
                        fitChars++;
                    }

                    // Try to break at word boundary (last space within fitting chars)
                    // This matches CSS white-space: pre-wrap behavior
                    const fittingText = remainingText.substring(0, fitChars);
                    const lastSpaceIndex = fittingText.lastIndexOf(' ');
                    if (lastSpaceIndex > 0) {
                        // Break at the space - include the space at end of this line
                        fitChars = lastSpaceIndex + 1;
                    } else if (wrappedLine.length > 0) {
                        // No space found in this span - rather than breaking mid-word,
                        // push current line and try this text on a fresh line.
                        // This handles breaks between styled spans (e.g., ", " followed by a name)
                        lines.push(wrappedLine);
                        wrappedLine = [];
                        currentX = totalPrefixIndent;
                        continue;
                    }
                    // If line is empty and no space, break mid-word (very long words)

                    // Add the fitting part to current line
                    const fittingPart = remainingText.substring(0, fitChars);
                    if (fittingPart.length > 0) {
                        wrappedLine.push({ text: fittingPart, color: span.color, backgroundColor: span.backgroundColor, bold: span.bold, underline: span.underline });
                    }
                    remainingText = remainingText.substring(fitChars);

                    // Push current line and start a new one
                    if (wrappedLine.length > 0) {
                        lines.push(wrappedLine);
                    }
                    wrappedLine = [];
                    // Continuation lines get full prefix indent
                    currentX = totalPrefixIndent;
                }
            }
        }

        // Push the last wrapped line of this logical line
        if (wrappedLine.length > 0) {
            lines.push(wrappedLine);
        } else if (logicalLine.length === 0) {
            // Empty logical line (just a newline)
            lines.push([]);
        }
    }

    document.body.removeChild(measureSpan);

    // Measure actual width of each line (including offsets)
    const maxLineWidth = containerWidth; // Use container width as the max width

    const scale = 2;
    const lineHeightPx = fontSize * lineHeight;
    const width = Math.max(200, maxLineWidth + padding * 2);
    const height = padding * 2 + lines.length * lineHeightPx;

    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.scale(scale, scale);

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    ctx.textBaseline = 'top';

    for (let i = 0; i < lines.length; i++) {
        const y = padding + i * lineHeightPx + (lineHeightPx - fontSize) / 2;
        const lineHasPrefix = lines[i].length > 0 && (lines[i][0].color === TIMESTAMP_COLOR || lines[i][0].color === MESSAGE_TYPE_COLOR);
        // Calculate x offset based on line position and prefix presence
        let x: number;
        if (i === 0 && firstLineHasPrependedPrefix) {
            // First line with prepended prefix starts at padding, prefix renders first,
            // then offset is applied after the last prefix span
            x = padding;
        } else if (!lineHasPrefix && totalPrefixIndent > 0) {
            x = padding + totalPrefixIndent;
        } else {
            x = padding;
        }

        for (let j = 0; j < lines[i].length; j++) {
            const span = lines[i][j];
            ctx.font = span.bold ? boldFont : font;
            const textWidth = ctx.measureText(span.text).width;

            if (span.backgroundColor) {
                ctx.fillStyle = span.backgroundColor;
                ctx.fillRect(x, y - 2, textWidth, fontSize + 2);
            }

            ctx.fillStyle = span.color;
            ctx.fillText(span.text, x, y);

            if (span.underline) {
                ctx.strokeStyle = span.color;
                ctx.lineWidth = 1;
                const underlineY = y + fontSize + 1;
                ctx.beginPath();
                if (span.underline === 'dotted') {
                    ctx.setLineDash([2, 2]);
                }
                ctx.moveTo(x, underlineY);
                ctx.lineTo(x + textWidth, underlineY);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            x += textWidth;

            // After rendering the last prepended prefix span on the first line, apply content offset
            if (i === 0 && firstLineHasPrependedPrefix && j === prependedPrefixCount - 1 &&
                (span.color === TIMESTAMP_COLOR || span.color === MESSAGE_TYPE_COLOR)) {
                x += firstLinePixelOffset;
            }
        }
    }

    await copyCanvasToClipboard(canvas);
}

export async function saveOutputAsHtml(): Promise<void> {
    const { spans, hasSelection } = getSelectedContent();
    if (!hasSelection || spans.length === 0) {
        throw new Error('Brak zaznaczenia');
    }

    const outputWrapper = document.getElementById('main_text_output_msg_wrapper');
    const bgColor = outputWrapper?.style.backgroundColor || '#242424';
    const computedStyle = outputWrapper ? window.getComputedStyle(outputWrapper) : null;
    const fontSize = computedStyle?.fontSize || '14px';
    const fontFamily = computedStyle?.fontFamily || 'monospace';

    // Split spans into logical lines
    const logicalLines: StyledSpan[][] = [];
    let currentLine: StyledSpan[] = [];

    for (const span of spans) {
        const parts = span.text.split('\n');
        for (let i = 0; i < parts.length; i++) {
            if (i > 0) {
                logicalLines.push(currentLine);
                currentLine = [];
            }
            if (parts[i]) {
                currentLine.push({ text: parts[i], color: span.color, bold: span.bold });
            }
        }
    }
    if (currentLine.length > 0) {
        logicalLines.push(currentLine);
    }

    // Check if we have any timestamps or message types — drives indent class and CSS
    const hasAnyTimestamp = logicalLines.some(line => line.length > 0 && line[0].color === TIMESTAMP_COLOR);
    const hasAnyMessageType = logicalLines.some(line => {
        const afterTimestamp = (line.length > 0 && line[0].color === TIMESTAMP_COLOR) ? 1 : 0;
        return line.length > afterTimestamp && line[afterTimestamp].color === MESSAGE_TYPE_COLOR;
    });
    const totalPrefixCh = (hasAnyTimestamp ? 13 : 0) + (hasAnyMessageType ? 13 : 0);

    // Build HTML content with inline styles
    // Use divs with hanging indent so wrapped lines maintain the prefix column
    const htmlLines: string[] = [];

    for (const line of logicalLines) {
        const lineHasPrefix = line.length > 0 && (line[0].color === TIMESTAMP_COLOR || line[0].color === MESSAGE_TYPE_COLOR);
        let lineHtml = '';

        for (const span of line) {
            const text = span.text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            const styles: string[] = [`color: ${span.color}`];
            if (span.backgroundColor) {
                styles.push(`background-color: ${span.backgroundColor}`);
            }
            if (span.bold) {
                styles.push('font-weight: bold');
            }

            lineHtml += `<span style="${styles.join('; ')}">${text}</span>`;
        }

        // Wrap in div with appropriate class for styling
        if (totalPrefixCh > 0) {
            if (lineHasPrefix) {
                htmlLines.push(`<div class="line-with-prefix">${lineHtml}</div>`);
            } else {
                htmlLines.push(`<div class="line-no-prefix">${lineHtml}</div>`);
            }
        } else {
            htmlLines.push(`<div>${lineHtml}</div>`);
        }
    }

    const htmlContent = htmlLines.join('\n');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body {
    background-color: ${bgColor};
    font-family: ${fontFamily};
    font-size: ${fontSize};
    line-height: 1.4;
    padding: 16px;
    margin: 0;
}
div {
    white-space: pre-wrap;
    word-wrap: break-word;
}
.line-with-prefix {
    padding-left: ${totalPrefixCh}ch;
    text-indent: -${totalPrefixCh}ch;
}
.line-no-prefix {
    padding-left: ${totalPrefixCh}ch;
}
</style>
</head>
<body>
${htmlContent}
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

    const a = document.createElement('a');
    a.href = url;
    a.download = `arkadia_${timestamp}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
