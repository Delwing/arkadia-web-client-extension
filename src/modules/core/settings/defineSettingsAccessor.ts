import { globalStorage } from '@modules/core/storage';

export interface SettingsAccessor<T> {
    /** Current values for this slice, with defaults applied for missing fields. */
    get(): T;
    /** Merge a partial update into this slice, preserving all sibling fields. */
    set(patch: Partial<T>): void;
    /** Replace the whole slice (equivalent to set with every field). */
    replace(value: T): void;
    /** Subscribe to changes of this slice; returns an unsubscribe function. */
    onChange(cb: (value: T) => void): () => void;
}

/**
 * Build a typed accessor for one concern-scoped slice of settings.
 *
 * Phase 1: every slice is physically backed by the single `uiSettings` blob.
 * The accessor picks its own `fieldKeys` out on read and merges them back on
 * write, so it never reads or clobbers sibling fields (including the stock UI's
 * chrome). A UI can therefore read/write its concern through this accessor
 * without touching settings it doesn't own.
 *
 * When the physical split lands (Phase 2), only this backing changes — every
 * consumer of the returned accessor stays exactly the same.
 */
export function defineUiSettingsSlice<T extends object>(
    fieldKeys: readonly (keyof T)[],
    defaults: T,
): SettingsAccessor<T> {
    const readBlob = (): Record<string, unknown> =>
        (globalStorage.get('uiSettings') as unknown as Record<string, unknown> | undefined) ?? {};

    const pick = (blob: Record<string, unknown>): Partial<T> => {
        const out: Partial<T> = {};
        for (const key of fieldKeys) {
            if ((key as string) in blob) {
                (out as Record<string, unknown>)[key as string] = blob[key as string];
            }
        }
        return out;
    };

    const get = (): T => ({ ...defaults, ...pick(readBlob()) });

    const set = (patch: Partial<T>): void => {
        const blob = { ...readBlob() };
        for (const key of fieldKeys) {
            if ((key as string) in patch) {
                blob[key as string] = (patch as Record<string, unknown>)[key as string];
            }
        }
        globalStorage.set('uiSettings', blob as never);
    };

    const replace = (value: T): void => set(value);

    const onChange = (cb: (value: T) => void): (() => void) =>
        globalStorage.onChange('uiSettings', () => cb(get()));

    return { get, set, replace, onChange };
}
