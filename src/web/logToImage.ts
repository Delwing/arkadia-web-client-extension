import type { FlatLogLine } from "./logBrowserUtils";

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

const MAX_CANVAS_DIM = 32767;

function extractStyledSpans(node: Node, defaultColor: string): StyledSpan[] {
    const spans: StyledSpan[] = [];

    function walk(n: Node, color: string, bgColor: string | undefined, bold: boolean, underline: UnderlineStyle | undefined) {
        if (n.nodeType === Node.TEXT_NODE) {
            const text = n.textContent || '';
            if (text) spans.push({ text, color, backgroundColor: bgColor, bold, underline });
            return;
        }
        if (n.nodeType !== Node.ELEMENT_NODE) return;
        const el = n as HTMLElement;

        let nextColor = color;
        if (el.style.color) nextColor = el.style.color;
        let nextBg = bgColor;
        if (el.style.backgroundColor) nextBg = el.style.backgroundColor;

        const cs = window.getComputedStyle(el);
        const nextBold = bold || cs.fontWeight === 'bold' || parseInt(cs.fontWeight) >= 700;
        let nextUnderline = underline;
        if (!nextUnderline && cs.textDecorationLine.includes('underline')) {
            nextUnderline = cs.textDecorationStyle === 'dotted' ? 'dotted' : 'solid';
        }

        for (const child of n.childNodes) {
            walk(child, nextColor, nextBg, nextBold, nextUnderline);
        }

        if (BLOCK_ELEMENTS.has(el.tagName) && spans.length > 0) {
            const last = spans[spans.length - 1];
            if (!last.text.endsWith('\n')) spans.push({ text: '\n', color, bold: false });
        }
    }

    walk(node, defaultColor, undefined, false, undefined);
    return spans;
}

interface WrappedLine {
    time?: string;
    spans: StyledSpan[];
}

export async function downloadLogAsImage(lines: FlatLogLine[], filename: string): Promise<void> {
    if (lines.length === 0) {
        throw new Error('Brak linii do zapisu');
    }

    const logsPreview = document.getElementById('logs-preview');
    const previewStyle = logsPreview ? window.getComputedStyle(logsPreview) : window.getComputedStyle(document.body);
    const bgColor = previewStyle.backgroundColor || '#242424';
    const defaultColor = previewStyle.color || '#ffffff';
    const fontSize = parseFloat(previewStyle.fontSize) || 14;
    const fontFamily = previewStyle.fontFamily || 'monospace';

    let timeColor = 'darkorange';
    if (logsPreview) {
        const sampleTime = document.createElement('span');
        sampleTime.className = 'log-time';
        sampleTime.style.visibility = 'hidden';
        sampleTime.textContent = '00:00:00.000';
        logsPreview.appendChild(sampleTime);
        timeColor = window.getComputedStyle(sampleTime).color || timeColor;
        logsPreview.removeChild(sampleTime);
    }

    const containerWidth = logsPreview ? Math.max(200, logsPreview.clientWidth - 16) : 1000;

    // Extract styled spans from each line's HTML via a hidden DOM container
    const extractor = document.createElement('div');
    extractor.style.position = 'absolute';
    extractor.style.visibility = 'hidden';
    extractor.style.left = '-9999px';
    extractor.style.font = `${fontSize}px ${fontFamily}`;
    document.body.appendChild(extractor);

    const linesData: { time: string; spans: StyledSpan[] }[] = [];
    for (const line of lines) {
        const div = document.createElement('div');
        div.innerHTML = line.html;
        extractor.appendChild(div);
        const spans = extractStyledSpans(div, defaultColor);
        extractor.removeChild(div);
        linesData.push({ time: line.time, spans });
    }
    document.body.removeChild(extractor);

    const lineHeight = 1.4;
    const padding = 16;
    const font = `${fontSize}px ${fontFamily}`;
    const boldFont = `bold ${fontSize}px ${fontFamily}`;
    const lineHeightPx = fontSize * lineHeight;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    ctx.font = font;
    const sampleTimeText = (linesData[0]?.time || '00:00:00.000') + ' ';
    const timeWidth = ctx.measureText(sampleTimeText).width;
    const contentX = padding + timeWidth;
    const contentMaxWidth = Math.max(50, containerWidth - timeWidth);

    const wrappedLines: WrappedLine[] = [];

    for (const ld of linesData) {
        // Split into logical sub-lines on newlines (block elements add them)
        const logicalLines: StyledSpan[][] = [];
        let cur: StyledSpan[] = [];
        for (const span of ld.spans) {
            const parts = span.text.split('\n');
            for (let i = 0; i < parts.length; i++) {
                if (i > 0) {
                    logicalLines.push(cur);
                    cur = [];
                }
                if (parts[i]) cur.push({ ...span, text: parts[i] });
            }
        }
        if (cur.length > 0 || logicalLines.length === 0) logicalLines.push(cur);

        for (let li = 0; li < logicalLines.length; li++) {
            const logical = logicalLines[li];
            let currentX = 0;
            let currentSpans: StyledSpan[] = [];
            const showTime = li === 0;
            let isFirstWrap = true;

            const pushLine = () => {
                wrappedLines.push({ time: showTime && isFirstWrap ? ld.time : undefined, spans: currentSpans });
                isFirstWrap = false;
                currentSpans = [];
                currentX = 0;
            };

            for (const span of logical) {
                let rem = span.text;
                while (rem.length > 0) {
                    ctx.font = span.bold ? boldFont : font;
                    const w = ctx.measureText(rem).width;
                    if (currentX + w <= contentMaxWidth) {
                        currentSpans.push({ ...span, text: rem });
                        currentX += w;
                        rem = '';
                        continue;
                    }

                    let lo = 1, hi = rem.length, fit = 0;
                    while (lo <= hi) {
                        const mid = (lo + hi) >> 1;
                        const mw = ctx.measureText(rem.substring(0, mid)).width;
                        if (currentX + mw <= contentMaxWidth) { fit = mid; lo = mid + 1; }
                        else hi = mid - 1;
                    }
                    if (fit === 0) fit = 1;
                    while (fit < rem.length && rem[fit] === ' ') fit++;

                    const fitting = rem.substring(0, fit);
                    const lastSpace = fitting.lastIndexOf(' ');
                    if (lastSpace > 0) fit = lastSpace + 1;
                    else if (currentSpans.length > 0) {
                        pushLine();
                        continue;
                    }

                    const part = rem.substring(0, fit);
                    if (part.length > 0) currentSpans.push({ ...span, text: part });
                    rem = rem.substring(fit);
                    pushLine();
                }
            }
            pushLine();
        }
    }

    const width = containerWidth + padding * 2;
    const height = padding * 2 + wrappedLines.length * lineHeightPx;

    // Prefer 2x for sharper text; fall back to 1x if it would overflow the
    // browser's canvas dimension limit. width is bounded by the preview width
    // so only height typically risks the cap.
    let scale = 2;
    if (height * scale > MAX_CANVAS_DIM || width * scale > MAX_CANVAS_DIM) {
        scale = 1;
    }
    if (height * scale > MAX_CANVAS_DIM || width * scale > MAX_CANVAS_DIM) {
        throw new Error(`Log za dlugi do wygenerowania obrazu (${wrappedLines.length} linii po zawinieciu). Uzyj filtra zakresu.`);
    }

    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.scale(scale, scale);

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = 'top';

    for (let i = 0; i < wrappedLines.length; i++) {
        const wl = wrappedLines[i];
        const y = padding + i * lineHeightPx + (lineHeightPx - fontSize) / 2;

        if (wl.time) {
            ctx.font = font;
            ctx.fillStyle = timeColor;
            ctx.fillText(wl.time, padding, y);
        }

        let x = contentX;
        for (const span of wl.spans) {
            ctx.font = span.bold ? boldFont : font;
            const tw = ctx.measureText(span.text).width;
            if (span.backgroundColor) {
                ctx.fillStyle = span.backgroundColor;
                ctx.fillRect(x, y - 2, tw, fontSize + 2);
            }
            ctx.fillStyle = span.color;
            ctx.fillText(span.text, x, y);
            if (span.underline) {
                ctx.strokeStyle = span.color;
                ctx.lineWidth = 1;
                const uy = y + fontSize + 1;
                ctx.beginPath();
                if (span.underline === 'dotted') ctx.setLineDash([2, 2]);
                ctx.moveTo(x, uy);
                ctx.lineTo(x + tw, uy);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            x += tw;
        }
    }

    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) { reject(new Error('Failed to create image blob')); return; }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            resolve();
        }, 'image/png');
    });
}
