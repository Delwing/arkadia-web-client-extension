import { useLayoutEffect, useState, useCallback, useRef, RefObject } from 'react';

export interface UseAutoScrollOptions {
  /** Threshold in pixels from bottom to consider "near bottom" (default: 50) */
  threshold?: number;
  /** Dependencies that trigger scroll check (e.g., messages array) */
  deps?: React.DependencyList;
}

export interface UseAutoScrollResult {
  /** Ref to attach to the scrollable container */
  containerRef: RefObject<HTMLDivElement>;
  /** Whether auto-scroll is enabled */
  autoScroll: boolean;
  /** Set auto-scroll state directly */
  setAutoScroll: React.Dispatch<React.SetStateAction<boolean>>;
  /** Handler to attach to onScroll event */
  handleScroll: () => void;
}

/**
 * Hook that handles common auto-scroll-to-bottom behavior for message lists.
 *
 * - Automatically scrolls to bottom when content changes (if enabled)
 * - Disables auto-scroll when user manually scrolls up
 * - Re-enables auto-scroll when user scrolls near bottom
 *
 * @example
 * ```tsx
 * const { containerRef, handleScroll } = useAutoScroll({ deps: [messages] });
 *
 * return (
 *   <div ref={containerRef} onScroll={handleScroll}>
 *     {messages.map(...)}
 *   </div>
 * );
 * ```
 */
export function useAutoScroll(options: UseAutoScrollOptions = {}): UseAutoScrollResult {
  const { threshold = 50, deps = [] } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when content changes
  // Uses useLayoutEffect to run synchronously after DOM mutations
  useLayoutEffect(() => {
    if (autoScroll && containerRef.current) {
      const container = containerRef.current;
      // Immediate scroll for regular mode
      container.scrollTop = container.scrollHeight;
      // Deferred scroll for managed layout mode where height calc may be delayed
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScroll, ...deps]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // If user is near bottom, enable auto-scroll
    const isNearBottom = scrollHeight - scrollTop - clientHeight < threshold;
    setAutoScroll(isNearBottom);
  }, [threshold]);

  return {
    containerRef,
    autoScroll,
    setAutoScroll,
    handleScroll,
  };
}
