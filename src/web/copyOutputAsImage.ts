let html2canvasPromise: Promise<typeof import('html2canvas')['default']> | null = null;

async function getHtml2Canvas() {
    if (!html2canvasPromise) {
        html2canvasPromise = import('html2canvas').then(m => m.default);
    }
    return html2canvasPromise;
}

function getSelectedHtml(): { html: string; hasSelection: boolean } {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
        return { html: '', hasSelection: false };
    }

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();
    const container = document.createElement('div');
    container.appendChild(fragment);
    return { html: container.innerHTML, hasSelection: true };
}

function getComputedStyles(): string {
    const styles: string[] = [];
    for (const sheet of document.styleSheets) {
        try {
            if (sheet.cssRules) {
                for (const rule of sheet.cssRules) {
                    styles.push(rule.cssText);
                }
            }
        } catch {
            // Cross-origin stylesheets will throw
        }
    }
    return styles.join('\n');
}

export async function copyOutputAsImage(): Promise<void> {
    const { html, hasSelection } = getSelectedHtml();
    if (!hasSelection) {
        throw new Error('Brak zaznaczenia');
    }

    const html2canvas = await getHtml2Canvas();

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '800px';
    container.style.padding = '16px';
    container.style.backgroundColor = getComputedStyle(document.body).backgroundColor || '#1a1a2e';
    container.style.fontFamily = 'monospace';
    container.style.fontSize = '14px';
    container.style.lineHeight = '1.4';
    container.style.color = getComputedStyle(document.body).color || '#ffffff';
    container.style.whiteSpace = 'pre-wrap';

    const styleElement = document.createElement('style');
    styleElement.textContent = getComputedStyles();
    container.appendChild(styleElement);

    const content = document.createElement('div');
    content.innerHTML = html;
    container.appendChild(content);

    document.body.appendChild(container);

    try {
        const canvas = await html2canvas(container, {
            backgroundColor: container.style.backgroundColor,
            scale: 2,
            logging: false,
            useCORS: true,
        });

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
    } finally {
        document.body.removeChild(container);
    }
}
