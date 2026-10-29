import type Client from "@client/Client";
import eventBus from "@modules/core/eventBus";
import { getShellSettings, onShellSettingsChange } from "@modules/core/settings";
import { updateMainMenuItem } from "@modules/core/mainMenuRegistry";
import { isMobileLikeViewport } from "@shared/dom/pointerEnvironment.ts";
import type mudClientInstance from "../MudClient";
import { AccountSession } from "../account/accountSession";
import { isResumeNoticeEnabled } from "../proxySession";
import { WakeLock } from "../platform/wakeLock";
import { setConnectionOffline, setConnectionStatus, setReconnectHandler } from "../commandInput/connectionView";
import { ConnectionController } from "./connectionController";

type MudClient = typeof mudClientInstance;

export interface StartedConnection {
    connection: ConnectionController;
    accountSession: AccountSession;
    /** Redraw the command line's connection view and the menu's Połącz/Rozłącz (the proxy mode changed). */
    refreshConnectionView: () => void;
    /** Hand the keyboard to the command line, unless an account screen or a phone needs it elsewhere. */
    focusCommandLine: () => void;
}

/**
 * The stock UI's connection: the controller (connect, autologin, reattach through
 * the session proxy, checks on returning to the tab), the e-mail account session
 * riding on it, the wake lock that follows it, and the command line's and the
 * menu's view of it. The login card (AuthOverlay) renders the same state itself.
 */
export function startConnection(client: Client, mudClient: MudClient): StartedConnection {
    const connection = new ConnectionController({
        connect: () => mudClient.connect(),
        disconnect: () => mudClient.disconnect(),
        isSocketOpen: () => mudClient.isSocketOpen(),
        checkConnection: () => mudClient.checkConnection(),
        sendGmcp: (path, payload) => mudClient.sendGmcp(path, payload),
        usesSessionProxy: () => mudClient.usesSessionProxy(),
        lastCloseCause: () => mudClient.lastCloseCause,
        prepareSounds: () => client.prepareSounds(),
        send: (text, echo, options) => client.send(text, echo, options),
        println: (text) => client.println(text),
        isResumeNoticeEnabled,
        on: (event, handler) => eventBus.on(event, handler),
        isSafari: /^((?!chrome|chromium|edg|android).)*safari/i.test(navigator.userAgent),
    });
    connection.start();

    /*
    Konto: logging in by e-mail, creating an account and a character over GMCP.
    Only the direct connection speaks it (see account/accountProtocol.ts), and
    while it runs the login card stays up over the live connection.
    */
    const accountSession = new AccountSession({
        sendGmcp: (path, payload) => mudClient.sendGmcp(path, payload ?? ''),
        onGmcp: (path, listener) => {
            const event = `gmcp.${path}` as const;
            mudClient.on(event, listener);
            return () => mudClient.off(event, listener);
        },
        whenReady: (run) => connection.whenGameReady(run),
        disconnect: () => connection.leaveAccount(),
    }, {
        onLoginFailed: (message) => connection.accountLoginFailed(message),
        onEnteredGame: () => {
            refreshConnectionView();
            if (!isMobileLikeViewport()) document.getElementById('message-input')?.focus();
        },
    });

    // The command line's connection view and the menu's Połącz/Rozłącz.
    function refreshConnectionView() {
        const { connected, connecting, disconnecting, authClosed } = connection.getState();

        // Offline with the login screen dismissed: the command line shows the closed
        // connection and offers to reconnect in place of the send button.
        setConnectionOffline(!connected && !connecting && authClosed);
        setConnectionStatus(connected ? 'connected' : connecting ? 'connecting' : 'disconnected', mudClient.getProxyMode());

        updateMainMenuItem('disconnect-button', connected
            ? { label: 'Rozłącz', disabled: disconnecting, tone: 'danger' }
            : { label: 'Połącz', disabled: connecting, tone: undefined });
    }
    connection.subscribe(() => refreshConnectionView());
    connection.onLeftGame(() => accountSession.reset());

    // Keep a phone from sleeping the tab while connected (the wake-lock setting).
    const wakeLock = new WakeLock();
    connection.onConnected(() => {
        eventBus.emit('refreshPositionWhenAble');
        if (getShellSettings().wakeLock !== false) {
            wakeLock.activate();
        }
        console.log('Client connected to Arkadia server.');
    });
    connection.onSessionLost(() => wakeLock.deactivate());
    onShellSettingsChange((shell) => {
        if (shell.wakeLock && connection.getState().connected) {
            wakeLock.activate();
        } else {
            wakeLock.deactivate();
        }
    });

    const focusCommandLine = () => {
        const messageInput = document.getElementById('message-input') as HTMLTextAreaElement | null;
        if (!messageInput) return;
        if (isMobileLikeViewport()) return;
        if (document.hidden) return;
        // The account screens are still up: the game comes once a character is chosen.
        if (accountSession.isActive()) return;
        messageInput.focus();
    };
    mudClient.on('client.connect', focusCommandLine);

    // The command line's reconnect while offline.
    setReconnectHandler(() => connection.toggle());

    refreshConnectionView();

    return { connection, accountSession, refreshConnectionView, focusCommandLine };
}
