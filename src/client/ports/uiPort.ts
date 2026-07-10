import type { HerbUse } from '@modules/data/dataStores/herbsStore';

/**
 * A single context-menu entry.
 *
 * `label` is intentionally UI-neutral (`string | Node`, no React types) so the
 * client can build menu entries without depending on the web UI. The web
 * implementation widens this to its own richer entry type when it renders.
 */
export interface ContextMenuEntry {
    label: string | Node;
    action: () => void;
    opensWindow?: boolean;
}

export interface ContextMenuOptions {
    header?: string;
    smallHeader?: boolean;
    columns?: number;
    compact?: boolean;
}

/**
 * UI-behaviour port: how the game client asks the surrounding UI to show
 * transient UI (tooltips, context menus).
 *
 * The client core must never import the web UI directly. Instead it calls
 * `getUiPort()` and the UI injects a real implementation at bootstrap via
 * `setUiPort()`. The default implementation is a no-op so the client runs
 * headless (e.g. under an alternate UI that has no tooltips).
 */
export interface UiPort {
    showHerbTooltip(herbId: string, actions: HerbUse[] | undefined, x: number, y: number): void;
    hideHerbTooltip(): void;
    showBookTooltip(categories: string[], x: number, y: number): void;
    hideBookTooltip(): void;
    showContextMenu(items: ContextMenuEntry[], x: number, y: number, options?: ContextMenuOptions): void;
}

const noopUiPort: UiPort = {
    showHerbTooltip() {},
    hideHerbTooltip() {},
    showBookTooltip() {},
    hideBookTooltip() {},
    showContextMenu() {},
};

let current: UiPort = noopUiPort;

/** Install the UI implementation of the port. Called once by the UI at bootstrap. */
export function setUiPort(port: UiPort): void {
    current = port;
}

/** Access the currently installed UI port (a no-op implementation until set). */
export function getUiPort(): UiPort {
    return current;
}
