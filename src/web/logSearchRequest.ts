/**
 * "Szukaj w logach" from the game text's right-click menu.
 *
 * The Logi window registers how it opens on a query; the menu only offers the
 * entry once it has done so.
 */
let handler: ((query: string) => void) | null = null;

export function setLogSearchHandler(next: ((query: string) => void) | null): void {
    handler = next;
}

export function canSearchLogs(): boolean {
    return handler !== null;
}

export function requestLogSearch(query: string): void {
    handler?.(query);
}

/**
 * Logi opened straight on Zarządzaj (from the storage window, say). Registered
 * by the Logi window like the search above.
 */
let managerHandler: (() => void) | null = null;

export function setLogManagerHandler(next: (() => void) | null): void {
    managerHandler = next;
}

export function requestLogManager(): void {
    managerHandler?.();
}
