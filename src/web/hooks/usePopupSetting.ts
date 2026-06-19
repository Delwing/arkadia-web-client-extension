import { useState, useCallback, useRef, useEffect } from 'react';
import eventBus from '@modules/core/eventBus';
import { getPopupSetting, setPopupSetting, resetLayoutCache } from '../layout/utils/layoutStorage';

type SetStateAction<T> = T | ((prevState: T) => T);

/**
 * Hook for persisting popup-specific settings in the layout storage.
 * Works like useState but automatically persists to localStorage.
 * Supports both direct values and function updaters.
 *
 * The value is re-hydrated when the layout state is replaced externally
 * (device sync import, uiSettings reset) so an imported popup setting is
 * reflected in the live component without a full page reload.
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

    // Keep latest defaultValue without making the effect depend on its identity
    // (callers often pass an inline default).
    const defaultRef = useRef(defaultValue);
    defaultRef.current = defaultValue;

    const setValue = useCallback((action: SetStateAction<T>) => {
        const newValue = typeof action === 'function'
            ? (action as (prevState: T) => T)(valueRef.current)
            : action;
        setValueInternal(newValue);
        setPopupSetting(popupId, key, newValue);
    }, [popupId, key]);

    // Re-read when the layout is replaced externally. Without this, an imported
    // popup setting (e.g. the chat "Druzyna" toggle) would stay stale until a
    // full page reload, and the stale component would write its old value back.
    useEffect(() => {
        const unsub = eventBus.on('layoutManagerStateChanged', () => {
            resetLayoutCache();
            const fresh = getPopupSetting(popupId, key, defaultRef.current);
            setValueInternal(prev => (Object.is(prev, fresh) ? prev : fresh));
        });
        return unsub;
    }, [popupId, key]);

    return [value, setValue];
}
