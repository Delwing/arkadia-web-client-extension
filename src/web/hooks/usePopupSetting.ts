import { useWindowSetting } from './useWindowSetting';

type SetStateAction<T> = T | ((prevState: T) => T);

/**
 * Hook for persisting popup-specific settings in the layout storage.
 * Works like useState but automatically persists to localStorage.
 * Supports both direct values and function updaters.
 *
 * The value stays in step with every other reader of the same key (e.g. the
 * window's settings cog) and is re-hydrated when the layout state is replaced
 * externally (device sync import, uiSettings reset).
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
    return useWindowSetting(popupId, key, defaultValue);
}
