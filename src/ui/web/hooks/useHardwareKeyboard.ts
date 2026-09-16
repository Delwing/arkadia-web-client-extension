import { useSyncExternalStore } from "react";
import { hasHardwareKeyboard, subscribeHardwareKeyboard } from "@shared/dom";

/**
 * React view of the hardware-keyboard guess (see @shared/dom/hardwareKeyboard).
 * Re-renders when the guess turns on, which it can do at any point - the player
 * pressing Alt for the first time is itself the evidence.
 */
export function useHardwareKeyboard(): boolean {
  return useSyncExternalStore(subscribeHardwareKeyboard, hasHardwareKeyboard, hasHardwareKeyboard);
}
