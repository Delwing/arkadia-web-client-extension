import { isLikelyTouchDevice, isTouchPointerType } from "@shared/dom/pointerEnvironment.ts";

const getMessageInput = () => document.getElementById("message-input") as HTMLTextAreaElement | null;

/**
 * A click in the content area (the output, the map) hands focus to the command
 * line, unless it landed on something that takes focus or input itself.
 */
export function installContentAreaFocus(contentArea: HTMLElement): void {
    const interactiveSelector = 'a, button, input, textarea, select, [contenteditable], .plugin-window, .app-modal, .managed-panel';

    // A click only hands focus to the command line; it must leave the
    // scrollback where it is, or a single click while reading the history
    // would close the split view. Closing it is a double-click or the
    // pane's close button.
    const focusKeepingScroll = () => {
        const messageInput = getMessageInput();
        if (!messageInput) return;
        messageInput.setAttribute('data-keep-scroll', '');
        messageInput.focus({preventScroll: true});
        messageInput.removeAttribute('data-keep-scroll');
    };

    const focusMessageInput = (target: EventTarget | null) => {
        // Check if there's a text selection
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) {
            return;
        }

        if (!target || !(target instanceof Element)) {
            focusKeepingScroll();
            return;
        }

        if (target.closest(interactiveSelector)) {
            return;
        }

        if (target.closest('[data-output-clickable]')) {
            // Output links are plain spans, so clicking one drops focus without
            // moving it anywhere useful. Restore it once the link handler has run,
            // unless that handler focused something on purpose (modal, editor...).
            setTimeout(() => {
                const active = document.activeElement;
                if (active && active !== document.body && active.closest?.(interactiveSelector)) {
                    return;
                }
                focusKeepingScroll();
            }, 0);
            return;
        }

        focusKeepingScroll();
        setTimeout(focusKeepingScroll, 1);
    };

    if (window.PointerEvent) {
        contentArea.addEventListener('pointerup', (event: PointerEvent) => {
            if (event.button !== 0) return;
            if (isTouchPointerType(event.pointerType)) return;
            focusMessageInput(event.target);
        });
    } else {
        contentArea.addEventListener('click', (event) => {
            if (isLikelyTouchDevice()) return;
            focusMessageInput(event.target);
        });
    }
}
