import { useEffect } from "react";
import eventBus, {ClientEvents} from "@modules/core/eventBus";

/**
 * Hook to subscribe to ArkadiaClient events via eventBus
 *
 * @param event - Event name to listen for
 * @param handler - Callback function to handle the event
 * @param deps - Optional dependency array (defaults to empty array)
 *
 * @example
 * useClientEvent('gmcp.Char.Vitals', (data) => {
 *   console.log('Vitals updated:', data);
 * });
 */
export function useClientEvent<T = any>(
  event: keyof ClientEvents,
  handler: (data: T) => void,
  deps: React.DependencyList = []
): void {
  useEffect(() => {
    const unsubscribe = eventBus.on(event, handler);

    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Caller controls deps via parameter
  }, deps);
}
