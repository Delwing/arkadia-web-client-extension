import { useState, useCallback, useRef, useEffect } from 'react';
import eventBus from '@modules/core/eventBus';
import { resetLayoutCache } from '../layout/utils/layoutStorage';
import { getWindowSetting, setWindowSetting, subscribeToWindowSetting } from '../layout/windowSettings';

type SetStateAction<T> = T | ((prevState: T) => T);

/**
 * useState for one key of a window's persisted settings bag (popups and the
 * built-in panels alike, see windowSettings.ts).
 *
 * Every reader of the same key stays in step: a write from the window's
 * settings cog reaches the window's own content at once, and a layout replaced
 * externally (device sync import, uiSettings reset) is re-read without a reload.
 */
export function useWindowSetting<T>(
    windowId: string,
    key: string,
    defaultValue: T,
): [T, (value: SetStateAction<T>) => void] {
    const [value, setValueInternal] = useState<T>(() => getWindowSetting(windowId, key, defaultValue));
    const valueRef = useRef(value);
    valueRef.current = value;

    // Keep latest defaultValue without making the effects depend on its identity
    // (callers often pass an inline default).
    const defaultRef = useRef(defaultValue);
    defaultRef.current = defaultValue;

    const setValue = useCallback((action: SetStateAction<T>) => {
        const newValue = typeof action === 'function'
            ? (action as (prevState: T) => T)(valueRef.current)
            : action;
        setValueInternal(newValue);
        setWindowSetting(windowId, key, newValue);
    }, [windowId, key]);

    useEffect(() => {
        const unsubSetting = subscribeToWindowSetting(windowId, key, (next) => {
            setValueInternal(prev => (Object.is(prev, next) ? prev : next as T));
        });
        // Without this, an imported setting (e.g. the chat "Druzyna" toggle)
        // would stay stale until a full page reload, and the stale component
        // would write its old value back.
        const unsubLayout = eventBus.on('layoutManagerStateChanged', () => {
            resetLayoutCache();
            const fresh = getWindowSetting(windowId, key, defaultRef.current);
            setValueInternal(prev => (Object.is(prev, fresh) ? prev : fresh));
        });
        return () => {
            unsubSetting();
            unsubLayout();
        };
    }, [windowId, key]);

    return [value, setValue];
}
