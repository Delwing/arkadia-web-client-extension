/**
 * The browser page as the game client's host (`HostPort`, `@client/ports`):
 * everything the client needs from `window`, `document` and `navigator`.
 * Installed by `installClientPorts()`, and by the unit-test setup, which runs
 * the client in jsdom as the page would.
 */
import type { HostKeyEvent, HostPort } from '@client/ports';
import { isIOS } from '@shared/dom/mobileOs.ts';

function isTextField(el: Element | null): boolean {
    if (!el) return false;
    const html = el as HTMLElement;
    return (typeof html.matches === 'function' && html.matches('input, textarea')) ||
        html.isContentEditable === true;
}

/** The command line opts back in to global keybinds by carrying `data-command-input`. */
function isCommandInput(el: Element | null): boolean {
    const html = el as HTMLElement | null;
    return !!html && typeof html.matches === 'function' && html.matches('[data-command-input]');
}

function listen<K extends keyof WindowEventMap>(type: K, listener: (event: WindowEventMap[K]) => void): () => void {
    window.addEventListener(type, listener);
    return () => window.removeEventListener(type, listener);
}

const GESTURES = ['click', 'keydown', 'touchstart', 'pointerdown'] as const;

export function createBrowserHost(): HostPort {
    return {
        // Read on each access: tests (and a devtools device switch) change the user agent.
        platform: {
            get isMac() {
                return typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
            },
            get isMobile() {
                return typeof navigator !== 'undefined' &&
                    /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            },
            get isIOS() {
                return isIOS();
            },
        },

        onKeyDown: (listener: (event: HostKeyEvent) => void) => listen('keydown', listener),

        isTypingInTextField() {
            const active = document.activeElement;
            return !isCommandInput(active) && isTextField(active);
        },

        onUnload: (listener) => listen('beforeunload', () => listener()),

        onUserGesture(listener) {
            const opts: AddEventListenerOptions = { capture: true, passive: true };
            const handler = () => listener();
            GESTURES.forEach(type => document.addEventListener(type, handler, opts));
            return () => GESTURES.forEach(type => document.removeEventListener(type, handler, opts));
        },

        onStorageChange: (key, listener) => listen('storage', (event) => {
            if (event.key === key) listener();
        }),

        async copyText(text) {
            await navigator.clipboard?.writeText(text);
        },

        saveFile(filename, content, mimeType) {
            const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        openTextFile(accept) {
            return new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = accept;
                input.addEventListener('change', () => {
                    const file = input.files?.[0];
                    if (!file) {
                        resolve(null);
                        return;
                    }
                    file.text().then(resolve, () => resolve(null));
                });
                document.body.appendChild(input);
                input.click();
                setTimeout(() => input.remove(), 0);
            });
        },

        loadScript(url) {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = url;
                script.async = true;
                script.onload = () => resolve(script);
                script.onerror = () => reject(new Error('Script failed to load'));
                document.head.appendChild(script);
            });
        },

        removeScript(handle) {
            if (handle instanceof HTMLScriptElement) handle.remove();
        },

        getLaunchParam: (name) => new URLSearchParams(window.location.search).get(name),

        clearLaunchParam(name) {
            const params = new URLSearchParams(window.location.search);
            params.delete(name);
            const base = window.location.origin + window.location.pathname;
            const rest = params.toString();
            window.location.replace(rest ? `${base}?${rest}` : base);
        },

        enableNotifications() {
            if (typeof Notification === 'undefined') return;
            if ('serviceWorker' in navigator && navigator.serviceWorker) {
                navigator.serviceWorker.register('sw.js').catch(() => {});
            }
            if (Notification.permission === 'default') {
                void Notification.requestPermission();
            }
        },

        notify(message) {
            if (typeof Notification === 'undefined') return;
            if (Notification.permission !== 'granted') return;
            if ('serviceWorker' in navigator && navigator.serviceWorker) {
                navigator.serviceWorker.ready
                    // No tag: every alert is its own notification. A shared tag made
                    // a repeat replace the one still in macOS Notification Center
                    // without a new banner, `renotify` notwithstanding.
                    .then((reg) => reg.showNotification(message))
                    .catch(() => {});
            } else {
                new Notification(message);
            }
        },
    };
}
