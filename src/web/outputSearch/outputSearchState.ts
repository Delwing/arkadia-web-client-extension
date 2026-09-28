/**
 * Whether the Ctrl+F bar is open, and on what. Kept outside the component so
 * the shortcut, the main menu entry and the bar itself can all reach it.
 */
export interface OutputSearchRequest {
    /** Bumped on every open, so re-opening starts afresh on the new query. */
    id: number;
    query: string;
}

let request: OutputSearchRequest | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function publish(next: OutputSearchRequest | null): void {
    request = next;
    listeners.forEach(listener => listener());
}

export function openOutputSearch(query = ""): void {
    publish({ id: nextId++, query });
}

export function closeOutputSearch(): void {
    if (request) publish(null);
}

export function isOutputSearchOpen(): boolean {
    return request !== null;
}

export function getOutputSearchRequest(): OutputSearchRequest | null {
    return request;
}

export function subscribeOutputSearch(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
