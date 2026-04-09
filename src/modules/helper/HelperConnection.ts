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
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = 'arkadia://launch';
        document.body.appendChild(iframe);
        setTimeout(() => iframe.remove(), 1000);
        this.pollAndConnect();
    }

    connect(): void {
        if (this.ws) {
            this.ws.close();
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
        };

        this.ws.onerror = () => {
            this.setState('disconnected');
            this.stopPing();
        };
    }

    send(msg: OutboundMsg): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    disconnect(): void {
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
