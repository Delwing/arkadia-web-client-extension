/**
 * "Szukaj w logach" from the game text's right-click menu.
 *
 * The Logi window registers how it opens on a query; the menu only offers the
 * entry when a host has done so (forge hosts the browser its own way).
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
