import { useLayoutEffect, useEffect, useState, useRef, RefObject } from 'react';
import {
  createSplitViewController,
  type SplitViewController,
} from '@shared/dom/splitViewController';

export interface UseAutoScrollOptions {
  /** Threshold in pixels from bottom to consider "near bottom" (default: 50) */
  threshold?: number;
  /** Dependencies that trigger scroll check (e.g., messages array) */
  deps?: React.DependencyList;
  /**
   * Height in px of the sticky split pane the caller renders while
   * `isSplitView` is true. Only needed by callers that render one — it is what
   * makes "at the bottom" account for the content the pane covers.
   */
  splitHeight?: number;
  /** Called with the committed pane height once a handle drag ends. */
  onSplitResize?: (heightPx: number) => void;
}

export interface UseAutoScrollResult {
  /** Ref to attach to the scrollable container */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Whether auto-scroll is enabled (false while the user is scrolled up) */
  autoScroll: boolean;
  /** Whether the user is scrolled up — render the split pane while true */
  isSplitView: boolean;
  /** Ref for the sticky split pane, so its real height can be measured */
  splitPaneRef: RefObject<HTMLDivElement | null>;
  /** Spread onto the split pane's drag handle to make it resizable */
  splitHandleProps: {
    onMouseDown: (event: React.MouseEvent) => void;
    onTouchStart: (event: React.TouchEvent) => void;
  };
}

/**
 * Auto-scroll-to-bottom for message lists, and the split view that goes with it.
 *
 * Thin React binding over `@shared/dom/splitViewController` — the same state
 * machine the main game output runs on, so a popup scrollback behaves exactly
 * like the main window: pinned to the bottom until the user scrolls up, paused
 * while they read, re-pinned when they come back. Callers that also render a
 * sticky pane (see `CombatPopup`) pass `splitHeight`/`onSplitResize` and use
 * `isSplitView`, `splitPaneRef` and `splitHandleProps`; callers that only want
 * auto-scroll can ignore all of those.
 *
 * @example
 * ```tsx
 * const { containerRef } = useAutoScroll({ deps: [messages] });
 *
 * return <div ref={containerRef}>{messages.map(...)}</div>;
 * ```
 */
export function useAutoScroll(options: UseAutoScrollOptions = {}): UseAutoScrollResult {
  const { threshold = 50, deps = [], splitHeight, onSplitResize } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const splitPaneRef = useRef<HTMLDivElement>(null);
  const [isSplitView, setIsSplitView] = useState(false);

  // Latest callback without re-creating the controller on every render.
  const onSplitResizeRef = useRef(onSplitResize);
  onSplitResizeRef.current = onSplitResize;

  const controllerRef = useRef<{ element: HTMLElement; controller: SplitViewController } | null>(null);

  // (Re)bind whenever the scroll container appears or is swapped out — popups
  // mount their body lazily, so the element is not there on the first render.
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (controllerRef.current?.element === element) return;
    controllerRef.current?.controller.destroy();
    controllerRef.current = null;
    if (!element) return;
    controllerRef.current = {
      element,
      controller: createSplitViewController({
        scrollEl: element,
        bottomThreshold: threshold,
        getSplitHeight: () => splitPaneRef.current?.clientHeight ?? 0,
        onOpen: () => setIsSplitView(true),
        onClose: () => setIsSplitView(false),
        // Both fire the same callback: the live value keeps the pane tracking
        // the pointer, and the measured one at drag end is what gets persisted.
        onHandleDrag: (heightPx) => onSplitResizeRef.current?.(heightPx),
        onHandleDragEnd: (heightPx) => onSplitResizeRef.current?.(heightPx),
      }),
    };
  });

  useEffect(() => () => {
    controllerRef.current?.controller.destroy();
    controllerRef.current = null;
  }, []);

  // Re-pin after the content changes. Synchronous first (no flash), then on the
  // following frames for managed layout modes where the height calc is delayed.
  // A no-op while the user is scrolled up into split view.
  useLayoutEffect(() => {
    controllerRef.current?.controller.pinToBottom(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // The pane appearing/growing changes how much content it covers, which is
  // part of the "at the bottom" test — re-measure once it has rendered.
  useLayoutEffect(() => {
    if (!isSplitView) controllerRef.current?.controller.pinToBottom(true);
  }, [isSplitView, splitHeight]);

  const startDrag = (event: React.MouseEvent | React.TouchEvent) => {
    controllerRef.current?.controller.startHandleDrag(event.nativeEvent as MouseEvent | TouchEvent);
  };

  return {
    containerRef,
    autoScroll: !isSplitView,
    isSplitView,
    splitPaneRef,
    splitHandleProps: {
      onMouseDown: startDrag,
      onTouchStart: startDrag,
    },
  };
}
