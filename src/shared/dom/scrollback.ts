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
    /** Slack in px when deciding "at the bottom" (default 50). */
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

    // The mirrored lines are bottom-anchored, so a pane edge between two lines
    // would cut the top one in half - and a half line under a moving scrollback
    // reads as a rendering glitch. Trimmed to the whole lines that fit.
    const applyHeight = () => {
        pane.style.height = `${splitHeight}px`;
        if (!pane.isConnected) return;
        const handleHeight = handle.offsetHeight;
        // clientHeight, not splitHeight: the CSS max-height may have clamped it
        const room = pane.clientHeight - handleHeight;
        const bottom = sticky.getBoundingClientRect().bottom;
        let fits = 0;
        for (const line of Array.from(sticky.children).reverse()) {
            const height = bottom - line.getBoundingClientRect().top;
            if (height > room) break;
            fits = height;
        }
        if (fits > 0) pane.style.height = `${Math.ceil(fits + handleHeight)}px`;
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

    // The pane sits last among the host's lines so `position: sticky` holds it
    // at the bottom of the scrollport.
    const showPane = () => {
        if (scrollEl.lastChild !== pane) scrollEl.appendChild(pane);
    };

    const controller = createSplitViewController({
        scrollEl,
        bottomThreshold: options.bottomThreshold ?? 50,
        getSplitHeight: () => (pane.isConnected ? pane.clientHeight : 0),
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
            controller.pinToBottom(true);
        },
        onHandleDrag: (heightPx) => {
            splitHeight = heightPx;
            applyHeight();
        },
        onHandleDragEnd: () => {
            // Where the player let go, not the trimmed height - trimming it again
            // next time would shrink the pane a little with every drag.
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
            if (controller.isSplitView()) controller.close();
            else controller.pinToBottom(true);
        },
        remove: () => {
            observer.disconnect();
            detachHandle();
            controller.destroy();
            pane.remove();
        },
    };
}
