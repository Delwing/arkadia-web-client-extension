import {
    HELPER_BASE_URL,
    HELPER_WS_URL,
    type HelperStatus,
    type OutboundMsg,
    type InboundMsg,
    type HotkeyMsg,
    type BindResultMsg,
    type KeyCapturedMsg,
} from './helperProtocol';

export type HelperState = 'disconnected' | 'connecting' | 'connected';

export type HotkeyListener = (msg: HotkeyMsg) => void;
export type BindResultListener = (msg: BindResultMsg) => void;
export type KeyCapturedListener = (msg: KeyCapturedMsg) => void;
export type StateChangeListener = (state: HelperState) => void;

export class HelperConnection {
    private ws: WebSocket | null = null;
    private state: HelperState = 'disconnected';
    private pingInterval: ReturnType<typeof setInterval> | null = null;
    private hotkeyListeners: HotkeyListener[] = [];
    private bindResultListeners: BindResultListener[] = [];
    private keyCapturedListeners: KeyCapturedListener[] = [];
    private stateListeners: StateChangeListener[] = [];
    private focusListenersAttached = false;
    // Set by disconnect() so an intentional close isn't treated as a dropped
    // connection to reconnect. Reset on every connect()/launch().
    private intentionalClose = false;
    // Guards against overlapping reconnect loops (each unexpected close would
    // otherwise spawn its own pollAndConnect).
    private reconnecting = false;

    async probe(): Promise<HelperStatus | null> {
        try {
            const resp = await fetch(`${HELPER_BASE_URL}/status`, { signal: AbortSignal.timeout(2000) });
            if (!resp.ok) return null;
            return await resp.json() as HelperStatus;
        } catch {
            return null;
        }
    }

    launch(): void {
        this.intentionalClose = false;
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = 'arkadia://launch';
        document.body.appendChild(iframe);
        setTimeout(() => iframe.remove(), 1000);
        this.pollAndConnect();
    }

    connect(): void {
        this.intentionalClose = false;
        if (this.ws) {
            // Detach handlers before closing so the old socket's close event
            // doesn't trigger a reconnect (or leave its ping running) for a
            // connection we're replacing.
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.close();
            this.stopPing();
        }

        this.setState('connecting');
        this.ws = new WebSocket(HELPER_WS_URL);

        this.ws.onopen = () => {
            this.setState('connected');
            this.startPing();
            this.attachFocusListeners();
            // Send current focus state immediately so helper is in sync.
            this.sendBrowserFocused(!document.hidden && document.hasFocus());
        };

        this.ws.onmessage = (event) => {
            const msg = JSON.parse(event.data) as InboundMsg;
            this.handleMessage(msg);
        };

        this.ws.onclose = () => {
            this.setState('disconnected');
            this.stopPing();
            // The helper restarts itself to apply updates and exits when idle.
            // If we didn't tear this down deliberately, poll for it to come
            // back and reconnect — otherwise hotkeys/proxy silently stay dead.
            if (!this.intentionalClose) {
                this.scheduleReconnect();
            }
        };

        this.ws.onerror = () => {
            this.setState('disconnected');
            this.stopPing();
            // A 'close' event always follows 'error'; reconnect is scheduled
            // there to avoid double-scheduling.
        };
    }

    private scheduleReconnect(): void {
        if (this.intentionalClose || this.reconnecting) return;
        this.reconnecting = true;
        this.pollAndConnect().finally(() => {
            this.reconnecting = false;
        });
    }

    send(msg: OutboundMsg): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    disconnect(): void {
        // Mark intentional so neither the close handler nor an in-flight
        // pollAndConnect loop tries to reconnect.
        this.intentionalClose = true;
        this.stopPing();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.setState('disconnected');
    }

    onHotkey(listener: HotkeyListener): () => void {
        this.hotkeyListeners.push(listener);
        return () => {
            this.hotkeyListeners = this.hotkeyListeners.filter(l => l !== listener);
        };
    }

    onBindResult(listener: BindResultListener): () => void {
        this.bindResultListeners.push(listener);
        return () => {
            this.bindResultListeners = this.bindResultListeners.filter(l => l !== listener);
        };
    }

    onKeyCaptured(listener: KeyCapturedListener): () => void {
        this.keyCapturedListeners.push(listener);
        return () => {
            this.keyCapturedListeners = this.keyCapturedListeners.filter(l => l !== listener);
        };
    }

    onStateChange(listener: StateChangeListener): () => void {
        this.stateListeners.push(listener);
        return () => {
            this.stateListeners = this.stateListeners.filter(l => l !== listener);
        };
    }

    getState(): HelperState {
        return this.state;
    }

    private handleMessage(msg: InboundMsg): void {
        switch (msg.type) {
            case 'hotkey':
                this.hotkeyListeners.forEach(l => l(msg));
                break;
            case 'bind_result':
                this.bindResultListeners.forEach(l => l(msg));
                break;
            case 'key_captured':
                this.keyCapturedListeners.forEach(l => l(msg));
                break;
            case 'pong':
                break;
        }
    }

    private setState(state: HelperState): void {
        this.state = state;
        this.stateListeners.forEach(l => l(state));
    }

    private startPing(): void {
        this.pingInterval = setInterval(() => {
            this.send({ type: 'ping' });
        }, 30000);
    }

    private stopPing(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    private async pollAndConnect(): Promise<void> {
        const maxAttempts = 30;
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(r => setTimeout(r, 500));
            // Bail if disconnect() was called while we were waiting.
            if (this.intentionalClose) return;
            const status = await this.probe();
            if (status) {
                this.connect();
                return;
            }
        }
    }

    private sendBrowserFocused(focused: boolean): void {
        this.send({ type: 'set_browser_focused', focused });
    }

    private attachFocusListeners(): void {
        if (this.focusListenersAttached) return;
        this.focusListenersAttached = true;

        const onFocus = () => this.sendBrowserFocused(true);
        const onBlur = () => this.sendBrowserFocused(false);
        const onVisibility = () => this.sendBrowserFocused(!document.hidden && document.hasFocus());

        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);
        document.addEventListener('visibilitychange', onVisibility);
    }
}
