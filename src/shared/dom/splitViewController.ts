/**
 * Split-view state machine shared by every scrollback view: the main output
 * (`outputMessageHandler`) and the React popups that mirror game text (combat,
 * and anything else that adopts `useAutoScroll`).
 *
 * The rules are the same everywhere: a view is pinned to the bottom until the
 * user scrolls up; while it is scrolled up the split view is "open", auto-scroll
 * pauses, and the host mirrors the newest lines into a sticky pane at the bottom
 * so the fight stays readable while the scrollback is being read. What differs
 * between hosts — how the mirror is built, whether a pane exists at all — stays
 * with the host; this module only owns the detection and the drag handle.
 */

export type SplitViewControllerOptions = {
    /** The scrolling element (the scrollback container). */
    scrollEl: HTMLElement;
    /**
     * Height in px the sticky pane currently occupies at the bottom of the
     * scrollport, or 0 when it is hidden. Content behind it is obscured, so it
     * counts as "at the bottom".
     */
    getSplitHeight?: () => number;
    /** Called when the user scrolls away from the bottom. */
    onOpen?: () => void;
    /** Called when the view returns to the bottom. */
    onClose?: () => void;
    /** Live height while the split handle is being dragged. */
    onHandleDrag?: (heightPx: number) => void;
    /** Committed height once the drag ends — measured, so CSS clamps apply. */
    onHandleDragEnd?: (heightPx: number) => void;
    /** Smallest height the drag handle can produce (default 60). */
    minSplitHeight?: number;
    /**
     * Slack in px when deciding "at bottom". 1 (the default) is the strict
     * pixel-rounding tolerance the main output uses; popups that only want
     * auto-scroll pass a larger, friendlier threshold.
     */
    bottomThreshold?: number;
};

export type SplitViewController = {
    isSplitView(): boolean;
    isAtBottom(): boolean;
    /**
     * Suppresses (re)detection for `durationMs`. Never shortens a longer hold
     * already in effect unless `force` is set (the drag handle uses that to
     * release its open-ended hold).
     */
    suppress(durationMs: number, force?: boolean): void;
    /**
     * Re-pins the view to the bottom on the next frames, unless the user has
     * scrolled up into split view. `immediate` also pins synchronously, which
     * avoids a one-frame flash in React hosts that append and measure in the
     * same commit.
     */
    pinToBottom(immediate?: boolean): void;
    /** Closes the split view programmatically (host-initiated, e.g. a clear). */
    close(): void;
    /** Starts a split-handle drag. React hosts wire this to the handle's props. */
    startHandleDrag(event: MouseEvent | TouchEvent): void;
    /** Attaches drag listeners to a handle element; returns a detach function. */
    attachHandle(handle: HTMLElement): () => void;
    destroy(): void;
};

export function createSplitViewController({
    scrollEl,
    getSplitHeight = () => 0,
    onOpen,
    onClose,
    onHandleDrag,
    onHandleDragEnd,
    minSplitHeight = 60,
    bottomThreshold = 1,
}: SplitViewControllerOptions): SplitViewController {
    const doc = scrollEl.ownerDocument ?? document;

    let isOpen = false;
    let suppressUntil = 0;
    let pinScheduled = false;

    const suppress = (durationMs: number, force = false) => {
        const until = Date.now() + durationMs;
        suppressUntil = force ? until : Math.max(suppressUntil, until);
    };

    const isAtBottom = () =>
        scrollEl.scrollTop + scrollEl.clientHeight + getSplitHeight() >= scrollEl.scrollHeight - bottomThreshold;

    // Both transitions hold off (re)detection briefly, so the scroll events the
    // state change itself produces don't immediately flip it back.
    const openSplitView = () => {
        if (isOpen) return;
        isOpen = true;
        suppress(150);
        onOpen?.();
    };

    const closeSplitView = () => {
        if (!isOpen) return;
        isOpen = false;
        suppress(150);
        onClose?.();
    };

    const pinToBottom = (immediate = false) => {
        // Content can shrink out from under an open split view — the log was
        // cleared, or a filter now hides most of it. Nothing is left to scroll,
        // so no scroll event could ever close the split view again and the user
        // would be stranded looking at a pane mirroring an empty view. Same rule
        // a resize that makes everything fit applies.
        if (isOpen && scrollEl.scrollHeight <= scrollEl.clientHeight) closeSplitView();
        suppress(250);
        if (immediate && !isOpen) {
            scrollEl.scrollTop = scrollEl.scrollHeight;
        }
        // Coalesce a burst of appends in one tick into a single scheduled pin.
        if (pinScheduled) return;
        pinScheduled = true;
        // Deferred so layout changes (multibinds showing, a docked panel's
        // height calc) settle first; the second frame covers hosts where the
        // first one still reads stale dimensions.
        requestAnimationFrame(() => {
            pinScheduled = false;
            if (isOpen) return;
            scrollEl.scrollTop = scrollEl.scrollHeight;
            requestAnimationFrame(() => {
                if (isOpen) return;
                scrollEl.scrollTop = scrollEl.scrollHeight;
            });
        });
    };

    // Last acknowledged scrollport size. Width counts as much as height: a
    // narrower box rewraps every line and grows scrollHeight, which unpins the
    // view just as surely as a shorter one does.
    let previousWidth = scrollEl.clientWidth;
    let previousHeight = scrollEl.clientHeight;

    // Resizing is not scrolling. A resize (window resize, map/footer toggling,
    // a popup being dragged bigger) reflows the scrollback and makes the browser
    // emit a `scroll` event that has nothing to do with the user — it would
    // otherwise read as "scrolled up" and flip the split view on. Whichever runs
    // first for a given resize, the scroll handler or the ResizeObserver, calls
    // this: it swallows the reflow's scroll events and re-pins. Returns whether
    // a resize was handled.
    const handleResize = () => {
        const newWidth = scrollEl.clientWidth;
        const newHeight = scrollEl.clientHeight;
        if (newWidth === previousWidth && newHeight === previousHeight) return false;
        previousWidth = newWidth;
        previousHeight = newHeight;
        suppress(250);
        if (!isOpen) {
            // Split view off means the user wants the bottom, so re-pin
            // unconditionally: after a rewrap the pre-resize geometry can no
            // longer tell us whether we *were* at the bottom.
            pinToBottom();
        } else if (scrollEl.scrollHeight <= scrollEl.clientHeight) {
            // The box grew enough to hold the whole scrollback: there is nothing
            // left to scroll, so no scroll event could ever close the split view
            // again. Close it here rather than strand the user in a view that
            // mirrors lines already on screen.
            closeSplitView();
        }
        return true;
    };

    const checkSplitView = () => {
        if (handleResize()) return;
        if (Date.now() < suppressUntil) return;
        if (isAtBottom()) {
            closeSplitView();
        } else {
            openSplitView();
        }
    };
    scrollEl.addEventListener('scroll', checkSplitView);

    // Wheel handling covers the three moments the compositor cannot: opening one
    // frame before it processes a scroll up (which would otherwise jitter),
    // closing when the user wheels down while already at the bottom — there the
    // browser emits no scroll event at all, which after a resize that clamped
    // them to the bottom would leave no way out of the split view — and getting
    // out of the bottom at all while text is pouring in. That last one is why
    // the suppression window does not apply here: every appended line pushes it
    // forward, so during a busy fight it would never lapse, and the gesture the
    // user makes to read the log would be swallowed by the log growing. Unlike a
    // scroll event, a wheel event is never something we caused, so honouring it
    // cannot start a flicker.
    const onWheel = (e: WheelEvent) => {
        if (!isAtBottom()) return;
        if (e.deltaY < 0 && !isOpen && scrollEl.scrollHeight > scrollEl.clientHeight) {
            openSplitView();
        } else if (e.deltaY > 0 && isOpen) {
            closeSplitView();
        }
    };
    scrollEl.addEventListener('wheel', onWheel, {passive: true});

    // Split-handle drag (resize the sticky pane).
    let isDragging = false;
    const onDragMove = (e: MouseEvent | TouchEvent) => {
        if (!isDragging) return;
        e.preventDefault();
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const rect = scrollEl.getBoundingClientRect();
        onHandleDrag?.(Math.max(minSplitHeight, rect.bottom - clientY));
    };
    const onDragEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        doc.body.style.cursor = '';
        doc.body.style.userSelect = '';
        doc.removeEventListener('mousemove', onDragMove);
        doc.removeEventListener('mouseup', onDragEnd);
        doc.removeEventListener('touchmove', onDragMove);
        doc.removeEventListener('touchend', onDragEnd);
        // Force: releases the open-ended hold the drag start put in place.
        suppress(300, true);
        onHandleDragEnd?.(getSplitHeight());
    };
    const startHandleDrag = (e: MouseEvent | TouchEvent) => {
        if (e.type === 'mousedown') e.preventDefault();
        isDragging = true;
        // Hold the split view open for the whole drag.
        suppressUntil = Infinity;
        doc.body.style.cursor = 'ns-resize';
        doc.body.style.userSelect = 'none';
        doc.addEventListener('mousemove', onDragMove);
        doc.addEventListener('mouseup', onDragEnd);
        doc.addEventListener('touchmove', onDragMove, {passive: false});
        doc.addEventListener('touchend', onDragEnd);
    };

    const attachHandle = (handle: HTMLElement) => {
        handle.addEventListener('mousedown', startHandleDrag);
        handle.addEventListener('touchstart', startHandleDrag, {passive: true});
        return () => {
            handle.removeEventListener('mousedown', startHandleDrag);
            handle.removeEventListener('touchstart', startHandleDrag);
        };
    };

    // Keep the view pinned to the bottom when the scrollport resizes — unless
    // the user has scrolled up into split view.
    const resizeObserver = new ResizeObserver(() => {
        handleResize();
    });
    resizeObserver.observe(scrollEl);

    return {
        isSplitView: () => isOpen,
        isAtBottom,
        suppress,
        pinToBottom,
        close: closeSplitView,
        startHandleDrag,
        attachHandle,
        destroy() {
            scrollEl.removeEventListener('scroll', checkSplitView);
            scrollEl.removeEventListener('wheel', onWheel);
            doc.removeEventListener('mousemove', onDragMove);
            doc.removeEventListener('mouseup', onDragEnd);
            doc.removeEventListener('touchmove', onDragMove);
            doc.removeEventListener('touchend', onDragEnd);
            resizeObserver.disconnect();
        },
    };
}
