import { useState, useCallback } from "react";
import { getItemSync, setItemSync } from "@modules/core/storage";

/**
 * Hook for localStorage with type safety and React state synchronization
 *
 * @param key - localStorage key
 * @param defaultValue - Default value if key doesn't exist
 * @returns Tuple of [value, setValue] similar to useState
 *
 * @example
 * const [mode, setMode] = useLocalStorage('attack_mode', 'A');
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = getItemSync(key);
      return item?.[key] !== undefined ? item[key] : defaultValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return defaultValue;
    }
  });

  const setValue = useCallback(
    (value: T) => {
      try {
        setStoredValue(value);
        setItemSync(key, value);
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key]
  );

  return [storedValue, setValue];
}
