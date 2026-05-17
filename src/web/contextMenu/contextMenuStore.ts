import type { ReactNode } from 'react';

export interface ContextMenuEntry {
    label: ReactNode | Node;
    action: () => void;
    opensWindow?: boolean;
}

export interface ContextMenuOptions {
    header?: string;
    smallHeader?: boolean;
    columns?: number;
    compact?: boolean;
}

export interface ContextMenuState {
    visible: boolean;
    items: ContextMenuEntry[];
    x: number;
    y: number;
    options?: ContextMenuOptions;
}

const INITIAL_STATE: ContextMenuState = {
    visible: false,
    items: [],
    x: 0,
    y: 0,
};

let state: ContextMenuState = INITIAL_STATE;
const subscribers = new Set<() => void>();

function notify() {
    for (const fn of subscribers) fn();
}

export function getContextMenuSnapshot(): ContextMenuState {
    return state;
}

export function subscribeContextMenu(fn: () => void): () => void {
    subscribers.add(fn);
    return () => {
        subscribers.delete(fn);
    };
}

export function showContextMenu(
    items: ContextMenuEntry[],
    x: number,
    y: number,
    options?: ContextMenuOptions,
): void {
    state = { visible: true, items, x, y, options };
    notify();
}

export function hideContextMenu(): void {
    if (!state.visible) return;
    state = { ...state, visible: false };
    notify();
}
