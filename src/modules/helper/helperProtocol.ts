export type BindMode = 'browser_only' | 'global' | 'global_focus';

export type BindAction = 'command' | 'bind';

export interface HelperBind {
    id: string;
    key: string;
    mode: BindMode;
    action: BindAction;
    command?: string;
    remap_to?: string;
    focus_browser: boolean;
}

export interface RegisterBindsMsg {
    type: 'register_binds';
    binds: HelperBind[];
}

export interface UnregisterBindMsg {
    type: 'unregister_bind';
    id: string;
}

export interface SetWindowMatchMsg {
    type: 'set_window_match';
    patterns: string[];
}

export interface SetBrowserFocusedMsg {
    type: 'set_browser_focused';
    focused: boolean;
}

export interface StartCaptureMsg {
    type: 'start_capture';
}

export interface PingMsg {
    type: 'ping';
}

export type OutboundMsg = RegisterBindsMsg | UnregisterBindMsg | SetWindowMatchMsg | SetBrowserFocusedMsg | StartCaptureMsg | PingMsg;

export interface HotkeyMsg {
    type: 'hotkey';
    id: string;
    key: string;
    timestamp: number;
}

export interface BindResultMsg {
    type: 'bind_result';
    id: string;
    success: boolean;
    error: string | null;
}

export interface KeyCapturedMsg {
    type: 'key_captured';
    key: string;
}

export interface PongMsg {
    type: 'pong';
}

export type InboundMsg = HotkeyMsg | BindResultMsg | KeyCapturedMsg | PongMsg;

export interface HelperStatus {
    status: string;
    version: string;
    platform: string;
}

export const HELPER_PORT = 19876;
export const HELPER_BASE_URL = `http://127.0.0.1:${HELPER_PORT}`;
export const HELPER_WS_URL = `ws://127.0.0.1:${HELPER_PORT}/ws`;
