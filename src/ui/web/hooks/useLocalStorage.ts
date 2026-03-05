import { useState, useCallback } from "react";
import { characterStorage, globalStorage } from "@modules/core/storage";
import { characterStorageKeys } from "@modules/core/storageSchema";

const characterKeySet = new Set<string>(characterStorageKeys);

function getStorage(key: string): { get(k: any): any; set(k: any, v: any): void } {
  return characterKeySet.has(key) ? characterStorage : globalStorage;
}

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
      const value = getStorage(key).get(key as any);
      return value !== undefined ? value as T : defaultValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return defaultValue;
    }
  });

  const setValue = useCallback(
    (value: T) => {
      try {
        setStoredValue(value);
        getStorage(key).set(key as any, value);
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key]
  );

  return [storedValue, setValue];
}
