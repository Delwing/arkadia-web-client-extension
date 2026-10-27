/**
 * A scrollback with the split view, for hosts that build their list by hand
 * (plugin popups via `api.ui.attachScrollback`) rather than through React's
 * `useAutoScroll`. Same engine (`splitViewController`) and the same
 * `.popup-split-*` pane: pinned to the bottom until the user scrolls up, then
 * the newest lines are mirrored into a sticky pane while they read.
 *
 * The host only appends, removes or replaces the scroller's children; a
 * MutationObserver re-pins the view and refreshes the mirror after every change.
 */
import { createSplitViewController } from './splitViewController';

export interface ScrollbackOptions {
    /** Newest children mirrored into the pane (default 40). */
    splitLines?: number;
    /** Starting pane height in px (default 120). */
    splitHeight?: number;
    /** Called with the pane height once the user finishes dragging its handle. */
    onSplitResize?: (heightPx: number) => void;
    /**
     * Builds the pane's lines. By default the last `splitLines` children are
     * cloned, which drops their event listeners - pass this when lines need
     * live handlers (click a command, open a link).
     */
    renderSplit?: (lines: number) => Node[];
    /** Called when the split view opens (true) or closes (false). */
    onSplitViewChange?: (open: boolean) => void;
    /** Slack in px when deciding "at the bottom" (default 1: only the real bottom). */
    bottomThreshold?: number;
}

export interface ScrollbackHandle {
    /** Whether the user is scrolled up and the split pane is showing. */
    isSplitView(): boolean;
    /** Re-pin and re-mirror after a change that kept the same children (an edited line). */
    refresh(): void;
    /** Resize the pane, e.g. from a stored setting. */
    setSplitHeight(heightPx: number): void;
    /** Leave the split view and jump to the bottom. */
    scrollToBottom(): void;
    /** Detach: listeners, the pane and the observer go; the content stays. */
    remove(): void;
}

const DEFAULT_SPLIT_LINES = 40;
const DEFAULT_SPLIT_HEIGHT = 120;

export function attachScrollback(scrollEl: HTMLElement, options: ScrollbackOptions = {}): ScrollbackHandle {
    const doc = scrollEl.ownerDocument ?? document;
    const splitLines = options.splitLines ?? DEFAULT_SPLIT_LINES;
    let splitHeight = options.splitHeight ?? DEFAULT_SPLIT_HEIGHT;

    const pane = doc.createElement('div');
    pane.className = 'popup-split-bottom';
    const handle = doc.createElement('div');
    handle.className = 'popup-split-handle';
    const sticky = doc.createElement('div');
    sticky.className = 'popup-split-sticky';
    pane.append(handle, sticky);

    const applyHeight = () => {
        pane.style.height = `${splitHeight}px`;
        pane.style.marginTop = `${-splitHeight}px`;
        if (!pane.isConnected) return;
        // The pane lies over the last lines instead of being added below them,
        // so opening and closing it never changes the scroll height. When it
        // did, a smooth scroll already under way kept heading for the old,
        // taller bottom: Chrome drew the list shifted - an empty strip, lines
        // doubled - until something made it redraw. At the very bottom the pane
        // covers the newest lines with its own copy of them. Measured: the CSS
        // max-height may have clamped it.
        pane.style.marginTop = `${-pane.offsetHeight}px`;
    };

    const renderMirror = () => {
        const nodes = options.renderSplit
            ? options.renderSplit(splitLines)
            : Array.from(scrollEl.children)
                .filter((child) => child !== pane)
                .slice(-splitLines)
                .map((child) => child.cloneNode(true));
        sticky.replaceChildren(...nodes);
    };

    // The sticky pane is drawn on its own layer, where Chrome smooths text in
    // grey; the list on the page used subpixel smoothing, so coloured text
    // (nicks) looked a shade different in the pane. On its own layer too, the
    // list is drawn the same way.
    const previousWillChange = scrollEl.style.willChange;
    scrollEl.style.willChange = 'transform';

    // The pane sits last among the host's lines so `position: sticky` holds it
    // at the bottom of the scrollport.
    const showPane = () => {
        if (scrollEl.lastChild !== pane) scrollEl.appendChild(pane);
    };

    const controller = createSplitViewController({
        scrollEl,
        // Only the real bottom closes the pane. There it covers exactly the same
        // lines it shows, so closing changes nothing on screen. Closing it
        // earlier meant jumping the rest of the way while a smooth scroll was
        // still running, and Chrome drew a frame or two of shifted, doubled
        // lines - left on screen until the mouse passing over them redrew them.
        bottomThreshold: options.bottomThreshold ?? 1,
        // The pane lies over the content rather than adding below it (see
        // applyHeight), so only the real bottom counts as "at the bottom"
        getSplitHeight: () => 0,
        onOpen: () => {
            // The pane bleeds over the scroller's side padding, so match it.
            pane.style.setProperty('--popup-split-gutter', getComputedStyle(scrollEl).paddingLeft || '0px');
            renderMirror();
            showPane();
            applyHeight();
            options.onSplitViewChange?.(true);
        },
        onClose: () => {
            pane.remove();
            options.onSplitViewChange?.(false);
        },
        onHandleDrag: (heightPx) => {
            splitHeight = heightPx;
            applyHeight();
        },
        onHandleDragEnd: () => {
            // Where the player let go
            options.onSplitResize?.(splitHeight);
        },
    });
    const detachHandle = controller.attachHandle(handle);

    const sync = () => {
        // Closes a split view whose content shrank to nothing to scroll.
        controller.pinToBottom(true);
        if (controller.isSplitView()) {
            showPane();
            renderMirror();
            applyHeight();
        }
    };

    // Our own pane moves come back as mutations too; only the host's count.
    const observer = new MutationObserver((records) => {
        const hostChange = records.some((record) =>
            [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some((node) => node !== pane));
        if (hostChange) sync();
    });
    observer.observe(scrollEl, { childList: true });

    controller.pinToBottom(true);

    return {
        isSplitView: () => controller.isSplitView(),
        refresh: sync,
        setSplitHeight: (heightPx) => {
            splitHeight = heightPx;
            applyHeight();
        },
        scrollToBottom: () => {
            controller.close();
            controller.pinToBottom(true);
        },
        remove: () => {
            observer.disconnect();
            detachHandle();
            controller.destroy();
            pane.remove();
            scrollEl.style.willChange = previousWillChange;
        },
    };
}
