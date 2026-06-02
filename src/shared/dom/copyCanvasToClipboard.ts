import { getActiveAppWindow } from './popoutWindows.ts';

/**
 * Copies a canvas element to the clipboard as a PNG image.
 *
 * Uses `Promise<Blob>` inside `ClipboardItem` so that `clipboard.write()`
 * is called synchronously within the user gesture — required by Safari.
 *
 * Requires a secure context (HTTPS). Falls back to an error message on HTTP.
 *
 * Writes via the *focused* app window's clipboard so the copy works when
 * triggered from a popped-out panel (the browser only lets the focused
 * document touch the clipboard).
 */
export function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<void> {
    const win = getActiveAppWindow();
    const clipboard = win.navigator.clipboard;
    const ClipboardItemCtor = (
        win as Window & { ClipboardItem?: typeof ClipboardItem }
    ).ClipboardItem;
    if (!clipboard?.write || typeof ClipboardItemCtor === 'undefined') {
        return Promise.reject(new Error(
            'Kopiowanie do schowka wymaga HTTPS'
        ));
    }

    return clipboard.write([
        new ClipboardItemCtor({
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
