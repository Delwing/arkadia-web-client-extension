/**
 * Adapter contract for a synced data type. Data stays in the feature's own
 * storage; the adapter only lists it and writes merged values back.
 * See docs/dev/SYNC_V2_PLAN.md, sections 6 and 7.
 */

import type { MergeRule } from './records';

export interface LocalItem<V = unknown> {
    /** 'global' | `char:${name}` | `device:${deviceId}` */
    scope: string;
    key: string;
    value: V;
}

export interface ItemChange<V = unknown> {
    scope: string;
    key: string;
    /** Absent together with `deleted`. */
    value?: V;
    deleted?: true;
    /**
     * Counter types only: the local value the tracker read when it computed
     * `value`. Adapters apply the difference to what is stored at write time
     * (see applyCounterChange), so a count added in between isn't lost.
     */
    previous?: V;
}

/** The counter value to store: what is stored now, moved by the change's difference. */
export function applyCounterChange(
    stored: Record<string, number> | undefined,
    change: ItemChange<Record<string, number>>,
): Record<string, number> {
    const target = change.value ?? {};
    const previous = change.previous ?? {};
    const current = stored ?? {};
    const result: Record<string, number> = {};
    for (const field of new Set([...Object.keys(target), ...Object.keys(previous), ...Object.keys(current)])) {
        const value = (current[field] ?? 0) + (target[field] ?? 0) - (previous[field] ?? 0);
        if (value !== 0) result[field] = value;
    }
    return result;
}

export type UserDataScope = 'global' | 'character' | 'device';

export interface UserDataType<V = any> {
    id: string;
    /**
     * 'device': each device keeps its own value; values from other devices of
     * the same sync group apply locally (the newest one wins).
     */
    scope: UserDataScope;
    rule: MergeRule<V>;
    /** User-edited data: an item missing locally was deleted. Otherwise it is restored. */
    deletable?: boolean;
    read(): LocalItem<V>[] | Promise<LocalItem<V>[]>;
    write(changes: ItemChange<V>[]): void | Promise<void>;
}

export const GLOBAL_SCOPE = 'global';

export function characterScope(name: string): string {
    return `char:${name}`;
}

export function characterFromScope(scope: string): string | null {
    return scope.startsWith('char:') ? scope.slice(5) : null;
}

export function deviceScope(deviceId: string): string {
    return `device:${deviceId}`;
}

export function deviceFromScope(scope: string): string | null {
    return scope.startsWith('device:') ? scope.slice(7) : null;
}
