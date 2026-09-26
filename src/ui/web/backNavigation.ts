import { useEffect, useRef } from 'react';

/**
 * The phone's Back button (Android's gesture or key, the browser's ←) closes
 * whatever sits on top - a context menu, a ☰ menu, a dialog, a floating
 * window, a page-level modal - instead of leaving the page and dropping the
 * game connection.
 *
 * Every open layer holds one history entry of ours. Opening a layer pushes
 * one; Back pops it and this module closes the layer that was on top. A layer
 * closed any other way (its ×, Escape, a click outside) gives its entry back,
 * so the history never keeps entries that Back would spend doing nothing.
 *
 * The entries are anonymous - the stack only counts them - so layers may close
 * in any order: whichever closes, the topmost entry goes, and the next Back
 * still closes what is on top at that moment.
 *
 * Only on touch screens. A desktop's Back is a page-level action people expect
 * to leave the page with, and they have Escape for the rest.
 */

const STATE_KEY = '__arkadiaBackLayer';
/** Touch screens: phones and tablets, the ones with a Back button of their own. */
const TOUCH_QUERY = '(pointer: coarse)';

interface Layer {
    close: () => void;
}

const layers: Layer[] = [];
/** How deep into our own entries the history currently sits. */
let depth = 0;
/** A history.go() of ours is in flight; its popstate is not the user's Back. */
let syncing = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let installed = false;
let forced: boolean | null = null;

function entryDepth(state: unknown): number {
    const value = (state as Record<string, unknown> | null)?.[STATE_KEY];
    return typeof value === 'number' && value > 0 ? value : 0;
}

function finishSync(): void {
    syncing = false;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = null;
}

/** Bring the history in line with the open layers: one entry per layer. */
function sync(): void {
    if (syncing) return;
    if (depth > layers.length) {
        syncing = true;
        // history.go() is asynchronous and says nothing when it cannot move;
        // should its popstate never come, stop waiting rather than stop syncing.
        syncTimer = setTimeout(() => {
            finishSync();
            depth = entryDepth(history.state);
            sync();
        }, 1000);
        history.go(layers.length - depth);
        return;
    }
    while (depth < layers.length) {
        depth += 1;
        const base = history.state && typeof history.state === 'object' ? history.state : {};
        history.pushState({ ...base, [STATE_KEY]: depth }, '');
    }
}

function onPopState(event: PopStateEvent): void {
    depth = entryDepth(event.state);
    if (syncing) {
        finishSync();
        sync();
        return;
    }
    // The user walked back past these layers: close them, top first.
    while (layers.length > depth) {
        layers.pop()!.close();
    }
    // Forward into a stale entry of ours, or a layer that opened while closing.
    sync();
}

function install(): void {
    if (installed) return;
    installed = true;
    // A reload keeps the entries of the page before it; their layers are gone,
    // so the first sync walks back over them.
    depth = entryDepth(history.state);
    window.addEventListener('popstate', onPopState);
}

/** Whether Back closes layers on this device. */
export function isBackNavigationEnabled(): boolean {
    if (forced !== null) return forced;
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(TOUCH_QUERY).matches;
}

/** Tests: switch Back handling on or off regardless of the device (null: detect). */
export function setBackNavigationEnabled(enabled: boolean | null): void {
    forced = enabled;
}

/**
 * Put a layer on top: the next Back calls `close`. Returns the release to call
 * when the layer closes by any other means; releasing twice, or after Back
 * closed it, does nothing.
 */
export function pushBackLayer(close: () => void): () => void {
    if (!isBackNavigationEnabled()) return () => {};
    install();
    const layer: Layer = { close };
    layers.push(layer);
    sync();
    return () => {
        const at = layers.indexOf(layer);
        if (at < 0) return;
        layers.splice(at, 1);
        sync();
    };
}

/** How many layers Back would close one by one (for tests). */
export function backLayerCount(): number {
    return layers.length;
}

/**
 * Keep a layer on the Back stack while `active` is true. `close` may change
 * between renders; the latest one runs.
 */
export function useBackLayer(active: boolean, close: () => void): void {
    const closeRef = useRef(close);
    closeRef.current = close;
    useEffect(() => {
        if (!active) return;
        return pushBackLayer(() => closeRef.current());
    }, [active]);
}
