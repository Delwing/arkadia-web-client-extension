interface StyledSpan {
    text: string;
    color: string;
    bold: boolean;
}

const BLOCK_ELEMENTS = new Set([
    'DIV', 'P', 'BR', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'BLOCKQUOTE', 'PRE', 'HR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
]);

function extractStyledText(node: Node, defaultColor: string): StyledSpan[] {
    const spans: StyledSpan[] = [];

    function walk(n: Node, inheritedColor: string, inheritedBold: boolean) {
        if (n.nodeType === Node.TEXT_NODE) {
            const text = n.textContent || '';
            if (text) {
                spans.push({ text, color: inheritedColor, bold: inheritedBold });
            }
            return;
        }

        if (n.nodeType === Node.ELEMENT_NODE) {
            const el = n as HTMLElement;
            if (el.classList.contains('output-timestamp')) {
                return;
            }

            const tagName = el.tagName;
            const isBlock = BLOCK_ELEMENTS.has(tagName);

            const style = window.getComputedStyle(el);
            const color = style.color || inheritedColor;
            const bold = inheritedBold || style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 700;

            for (const child of n.childNodes) {
                walk(child, color, bold);
            }

            if (isBlock && spans.length > 0) {
                const lastSpan = spans[spans.length - 1];
                if (!lastSpan.text.endsWith('\n')) {
                    spans.push({ text: '\n', color: inheritedColor, bold: false });
                }
            }
        }
    }

    walk(node, defaultColor, false);
    return spans;
}

function getSelectedContent(): { spans: StyledSpan[]; hasSelection: boolean } {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
        return { spans: [], hasSelection: false };
    }

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();
    const container = document.createElement('div');
    container.appendChild(fragment);
    document.body.appendChild(container);

    const bodyStyle = window.getComputedStyle(document.body);
    const defaultColor = bodyStyle.color || '#ffffff';
    const spans = extractStyledText(container, defaultColor);

    document.body.removeChild(container);
    return { spans, hasSelection: true };
}

export async function copyOutputAsImage(): Promise<void> {
    const { spans, hasSelection } = getSelectedContent();
    if (!hasSelection || spans.length === 0) {
        throw new Error('Brak zaznaczenia');
    }

    const bodyStyle = window.getComputedStyle(document.body);
    const bgColor = bodyStyle.backgroundColor || '#1a1a2e';

    const fontSize = 14;
    const lineHeight = 1.4;
    const padding = 16;
    const maxWidth = 800;
    const font = `${fontSize}px monospace`;
    const boldFont = `bold ${fontSize}px monospace`;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = font;

    const charWidth = ctx.measureText('M').width;
    const maxCharsPerLine = Math.floor((maxWidth - padding * 2) / charWidth);

    const lines: StyledSpan[][] = [];
    let currentLine: StyledSpan[] = [];
    let currentLineLength = 0;

    for (const span of spans) {
        const parts = span.text.split('\n');
        for (let i = 0; i < parts.length; i++) {
            if (i > 0) {
                lines.push(currentLine);
                currentLine = [];
                currentLineLength = 0;
            }

            let text = parts[i];
            while (text.length > 0) {
                const remaining = maxCharsPerLine - currentLineLength;
                if (text.length <= remaining) {
                    currentLine.push({ text, color: span.color, bold: span.bold });
                    currentLineLength += text.length;
                    break;
                } else {
                    currentLine.push({ text: text.slice(0, remaining), color: span.color, bold: span.bold });
                    lines.push(currentLine);
                    currentLine = [];
                    currentLineLength = 0;
                    text = text.slice(remaining);
                }
            }
        }
    }
    if (currentLine.length > 0) {
        lines.push(currentLine);
    }

    const scale = 2;
    const lineHeightPx = fontSize * lineHeight;
    const width = maxWidth;
    const height = padding * 2 + lines.length * lineHeightPx;

    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.scale(scale, scale);

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    ctx.textBaseline = 'top';

    for (let i = 0; i < lines.length; i++) {
        const y = padding + i * lineHeightPx + (lineHeightPx - fontSize) / 2;
        let x = padding;

        for (const span of lines[i]) {
            ctx.font = span.bold ? boldFont : font;
            ctx.fillStyle = span.color;
            ctx.fillText(span.text, x, y);
            x += ctx.measureText(span.text).width;
        }
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            b => {
                if (b) {
                    resolve(b);
                } else {
                    reject(new Error('Nie udało się utworzyć obrazu'));
                }
            },
            'image/png',
        );
    });

    await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
    ]);
}
