import { useCallback } from "react";
import eventBus from "../../../../client/src/eventBus";

/**
 * Hook to send commands to ArkadiaClient via eventBus
 *
 * @returns Function to send commands
 *
 * @example
 * const sendCommand = useClientCommand();
 * sendCommand('look');
 */
export function useClientCommand(): (command: string) => void {
  return useCallback((command: string) => {
    eventBus.emit("sendCommand", { command: command });
  }, []);
}
