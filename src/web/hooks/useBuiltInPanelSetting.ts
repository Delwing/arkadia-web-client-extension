import { useWindowSetting } from './useWindowSetting';

type SetStateAction<T> = T | ((prevState: T) => T);

/**
 * Hook for persisting built-in panel settings in the layout storage.
 * Works like useState but automatically persists to localStorage.
 * Supports both direct values and function updaters.
 *
 * The value stays in step with every other reader of the same key — the map
 * header menu reacts to a toggle flipped in the map's settings cog.
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
    return useWindowSetting(panelId, key, defaultValue);
}
