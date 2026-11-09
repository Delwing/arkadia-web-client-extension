/**
 * Host port: the browser-page capabilities the game client needs but must not
 * reach for itself — global key presses, page unload, the clipboard, files,
 * script tags, the page URL, system notifications.
 *
 * `src/client` never touches `document`, `window`, `navigator` or `location`
 * (ESLint `no-restricted-globals`); it calls `getHostPort()` instead and the
 * UI installs a real implementation at bootstrap via `setHostPort()` (the
 * stock one is `src/web/browserHost.ts`). The default is inert, so the client
 * runs headless: no keys arrive, nothing is copied, no file is offered.
 */

/** A key press, as much of it as keybinds read. A DOM `KeyboardEvent` satisfies it. */
export interface HostKeyEvent {
    readonly key: string;
    readonly code: string;
    readonly ctrlKey: boolean;
    readonly altKey: boolean;
    readonly shiftKey: boolean;
    readonly metaKey: boolean;
    readonly repeat: boolean;
    preventDefault(): void;
}

export interface HostPlatform {
    /** Apple keyboard layout (⌘/⌥ naming, Cmd-based shortcuts). */
    readonly isMac: boolean;
    /** A phone or tablet browser. */
    readonly isMobile: boolean;
    /** iOS or iPadOS, whose audio needs its own handling. */
    readonly isIOS: boolean;
}

export interface HostPort {
    readonly platform: HostPlatform;
    /** Every key press on the page. Returns an unsubscribe. */
    onKeyDown(listener: (event: HostKeyEvent) => void): () => void;
    /**
     * Whether focus is in a text field other than the command line — a global
     * keybind must not fire while the player types there.
     */
    isTypingInTextField(): boolean;
    /** The page is about to go away: flush unsaved state now. Returns an unsubscribe. */
    onUnload(listener: () => void): () => void;
    /** The player's first interaction with the page (unlocks audio playback). Returns an unsubscribe. */
    onUserGesture(listener: () => void): () => void;
    /** Another tab of this site changed `localStorage[key]`. Returns an unsubscribe. */
    onStorageChange(key: string, listener: () => void): () => void;
    copyText(text: string): Promise<void>;
    /** Offer `content` to the player as a downloaded file. */
    saveFile(filename: string, content: string, mimeType: string): void;
    /** Let the player pick a file; its text, or null if none was picked. */
    openTextFile(accept: string): Promise<string | null>;
    /**
     * Load a classic (non-module) script. Resolves with a handle that
     * `removeScript` takes to unload it again.
     */
    loadScript(url: string): Promise<unknown>;
    removeScript(handle: unknown): void;
    /** A query parameter the page was opened with. */
    getLaunchParam(name: string): string | null;
    /** Drop a launch parameter from the page URL (reloads the page). */
    clearLaunchParam(name: string): void;
    /** Ask for permission to show system notifications. */
    enableNotifications(): void;
    /** Show a system notification, if permitted. */
    notify(message: string): void;
}

const noop = () => {};

const inertHostPort: HostPort = {
    platform: { isMac: false, isMobile: false, isIOS: false },
    onKeyDown: () => noop,
    isTypingInTextField: () => false,
    onUnload: () => noop,
    onUserGesture: () => noop,
    onStorageChange: () => noop,
    copyText: () => Promise.resolve(),
    saveFile: noop,
    openTextFile: () => Promise.resolve(null),
    loadScript: () => Promise.reject(new Error('No host to load scripts into')),
    removeScript: noop,
    getLaunchParam: () => null,
    clearLaunchParam: noop,
    enableNotifications: noop,
    notify: noop,
};

let current: HostPort = inertHostPort;

/** Install the host implementation. Called once by the UI at bootstrap. */
export function setHostPort(port: HostPort): void {
    current = port;
}

/** The installed host, or the inert default. */
export function getHostPort(): HostPort {
    return current;
}
