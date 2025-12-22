import { useState, useCallback, useRef } from 'react';
import { getPopupSetting, setPopupSetting } from '../layout/utils/layoutStorage';

type SetStateAction<T> = T | ((prevState: T) => T);

/**
 * Hook for persisting popup-specific settings in the layout storage.
 * Works like useState but automatically persists to localStorage.
 * Supports both direct values and function updaters.
 *
 * @param popupId The popup identifier (e.g., 'popup:chat')
 * @param key The setting key (e.g., 'showTeamOnly')
 * @param defaultValue Default value if setting is not found
 *
 * @example
 * ```tsx
 * const [showTeamOnly, setShowTeamOnly] = usePopupSetting('popup:chat', 'showTeamOnly', false);
 * // Both work:
 * setShowTeamOnly(true);
 * setShowTeamOnly(prev => !prev);
 * ```
 */
export function usePopupSetting<T>(
    popupId: string,
    key: string,
    defaultValue: T,
): [T, (value: SetStateAction<T>) => void] {
    const [value, setValueInternal] = useState<T>(() => getPopupSetting(popupId, key, defaultValue));
    const valueRef = useRef(value);
    valueRef.current = value;

    const setValue = useCallback((action: SetStateAction<T>) => {
        const newValue = typeof action === 'function'
            ? (action as (prevState: T) => T)(valueRef.current)
            : action;
        setValueInternal(newValue);
        setPopupSetting(popupId, key, newValue);
    }, [popupId, key]);

    return [value, setValue];
}
