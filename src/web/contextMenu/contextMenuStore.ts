import type { ComponentType, ReactNode } from 'react';

/** A lucide icon (or anything drawn the same way), passed as the component. */
export type ContextMenuIcon = ComponentType<{ size?: number; strokeWidth?: number }>;

/** An inline button at a row's end (a herb's 1 / 3 / 5). */
export interface ContextMenuChoice {
    label: string;
    action: () => void;
    title?: string;
}

export interface ContextMenuEntry {
    label: ReactNode | Node;
    action: () => void;
    /** Ends in a small ↗: the entry opens a window. */
    opensWindow?: boolean;
    /** Drawn in the 16px column on the left. */
    icon?: ContextMenuIcon;
    /** A toggle: an accent checkmark in the icon column while on. */
    checked?: boolean;
    /** A key shown at the row's right end (Ctrl+C, F1). */
    hint?: string;
    /** A grey line under the label. */
    detail?: ReactNode;
    tone?: 'danger';
    /**
     * The caption of the section the entry belongs to. A separator (and the
     * caption, when there is one) starts wherever it changes.
     */
    section?: string;
    /** Starts a new block with a separator even within the same section. */
    separator?: boolean;
    /**
     * `tile`: icon above label, in a four-column grid (window launchers).
     * `quick`: a big button in one row of them (a room's Idz / Prowadz).
     */
    variant?: 'tile' | 'quick';
    /** A tile: its window is already open (a dot). A quick button: the primary one. */
    active?: boolean;
    /** Buttons at the row's end; the row itself then runs nothing. */
    choices?: ContextMenuChoice[];
}

export interface ContextMenuOptions {
    header?: string;
    /** Grey text after the header's name ("ob_48213 · druzyna"). */
    headerMeta?: string;
    smallHeader?: boolean;
    columns?: number;
    compact?: boolean;
    /** Fixed width in px; otherwise the menu fits its entries. */
    width?: number;
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
