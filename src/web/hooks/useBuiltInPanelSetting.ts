import { useState, useCallback, useRef } from 'react';
import { getBuiltInPanelSetting, setBuiltInPanelSetting } from '../layout/utils/layoutStorage';

type SetStateAction<T> = T | ((prevState: T) => T);

/**
 * Hook for persisting built-in panel settings in the layout storage.
 * Works like useState but automatically persists to localStorage.
 * Supports both direct values and function updaters.
 *
 * @param panelId The panel identifier ('map' or 'objectList')
 * @param key The setting key (e.g., 'cardViewMode')
 * @param defaultValue Default value if setting is not found
 *
 * @example
 * ```tsx
 * const [cardViewMode, setCardViewMode] = useBuiltInPanelSetting('objectList', 'cardViewMode', false);
 * // Both work:
 * setCardViewMode(true);
 * setCardViewMode(prev => !prev);
 * ```
 */
export function useBuiltInPanelSetting<T>(
    panelId: string,
    key: string,
    defaultValue: T,
): [T, (value: SetStateAction<T>) => void] {
    const [value, setValueInternal] = useState<T>(() => getBuiltInPanelSetting(panelId, key, defaultValue));
    const valueRef = useRef(value);
    valueRef.current = value;

    const setValue = useCallback((action: SetStateAction<T>) => {
        const newValue = typeof action === 'function'
            ? (action as (prevState: T) => T)(valueRef.current)
            : action;
        setValueInternal(newValue);
        setBuiltInPanelSetting(panelId, key, newValue);
    }, [panelId, key]);

    return [value, setValue];
}
