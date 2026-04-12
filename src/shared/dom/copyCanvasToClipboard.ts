/**
 * Copies a canvas element to the clipboard as a PNG image.
 *
 * Uses `Promise<Blob>` inside `ClipboardItem` so that `clipboard.write()`
 * is called synchronously within the user gesture — required by Safari.
 *
 * Requires a secure context (HTTPS). Falls back to an error message on HTTP.
 */
export function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<void> {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        return Promise.reject(new Error(
            'Kopiowanie do schowka wymaga HTTPS'
        ));
    }

    return navigator.clipboard.write([
        new ClipboardItem({
            'image/png': new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(
                    b => {
                        if (b) {
                            resolve(b);
                        } else {
                            reject(new Error('Failed to create image blob'));
                        }
                    },
                    'image/png',
                );
            }),
        }),
    ]);
}
