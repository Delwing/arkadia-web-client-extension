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

            // Only use inline style.color - don't use computed style for color
            // because the cloned content loses its original context
            let color = inheritedColor;
            if (el.style.color) {
                color = el.style.color;
            }

            const computedStyle = window.getComputedStyle(el);
            const bold = inheritedBold || computedStyle.fontWeight === 'bold' || parseInt(computedStyle.fontWeight) >= 700;

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

function getSelectedContent(): { spans: StyledSpan[]; hasSelection: boolean } {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
        return { spans: [], hasSelection: false };
    }

    const range = selection.getRangeAt(0);

    // Get color from ancestors of the original selection (before cloning loses it)
    const ancestorColor = getAncestorColor(range.startContainer);

    const fragment = range.cloneContents();
    const container = document.createElement('div');
    container.appendChild(fragment);
    document.body.appendChild(container);

    const bodyStyle = window.getComputedStyle(document.body);
    const defaultColor = ancestorColor || bodyStyle.color || '#ffffff';
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
    const font = `${fontSize}px monospace`;
    const boldFont = `bold ${fontSize}px monospace`;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Split spans into lines (by newlines only, no wrapping)
    const lines: StyledSpan[][] = [];
    let currentLine: StyledSpan[] = [];

    for (const span of spans) {
        const parts = span.text.split('\n');
        for (let i = 0; i < parts.length; i++) {
            if (i > 0) {
                lines.push(currentLine);
                currentLine = [];
            }
            if (parts[i]) {
                currentLine.push({ text: parts[i], color: span.color, bold: span.bold });
            }
        }
    }
    if (currentLine.length > 0) {
        lines.push(currentLine);
    }

    // Measure actual width of each line
    let maxLineWidth = 0;
    for (const line of lines) {
        let lineWidth = 0;
        for (const span of line) {
            ctx.font = span.bold ? boldFont : font;
            lineWidth += ctx.measureText(span.text).width;
        }
        maxLineWidth = Math.max(maxLineWidth, lineWidth);
    }

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
