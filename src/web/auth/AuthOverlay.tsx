import { type ComponentProps, type CSSProperties, type FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAppServices } from "../app/appServices";
import { Island } from "../app/Island";
import { AccountScreen } from "../account/AccountScreen";
import { ProxyControls } from "../hostProxy/ProxyControls";
import type { ProxyMode } from "../MudClient";
import { emberCount, emberVars, forgeThePassword } from "../loginFire";
import { CommitInfo } from "./CommitInfo";

type ProxyControlsProps = ComponentProps<typeof ProxyControls>;

export interface AuthOverlayProps {
    /** The connection footer's wiring (mode, proxy URL, MCCP, helper); the card follows its blocked state itself. */
    proxyControls: Omit<ProxyControlsProps, "onBlockedChange">;
    /** The connection mode now; only the direct connection logs in to an account by e-mail. */
    getProxyMode: () => ProxyMode;
    /** Runs after the player dismisses the card without connecting. */
    onDismissed?: () => void;
}

const notificationsGranted = () => typeof Notification !== "undefined" && Notification.permission === "granted";

/** The game's login messages about the password, in either spelling. */
const PASSWORD_NOTICE = /has(l|ł)o/i;

const icon = {
    width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth: 2.1, strokeLinecap: "round", strokeLinejoin: "round",
} as const;

/**
 * Logowanie: the card over the game while offline (or while an account's screens
 * are up), with the e-mail account screens, the connection footer and the build.
 * The ids are the ones password managers, the themes and the tests rely on.
 */
export function AuthOverlay({ proxyControls, getProxyMode, onDismissed }: AuthOverlayProps) {
    const { client, connection, accountSession } = useAppServices();
    const subscribeConnection = useCallback((onChange: () => void) => connection.subscribe(onChange), [connection]);
    const state = useSyncExternalStore(subscribeConnection, () => connection.getState());
    const account = useSyncExternalStore(accountSession.subscribe, accountSession.getState);
    const { connected, connecting, disconnecting, authClosed, playback, accountLeaving, loginNotice } = state;

    const [proxyMode, setProxyMode] = useState<ProxyMode>(getProxyMode);
    const [blocked, setBlocked] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [connectionOpen, setConnectionOpen] = useState(false);
    const [notifyHidden, setNotifyHidden] = useState(() => typeof Notification === "undefined" || notificationsGranted());
    const [embers] = useState(() => Array.from({ length: emberCount() }, emberVars));
    const characterRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    // Leaving an account keeps the card up through the close: there is no game
    // under it to show for the moment the socket takes to go.
    const accountUp = accountSession.isActive() || (accountLeaving && disconnecting);
    const shown = (!connected || accountUp) && !playback && !authClosed;
    // What the game said about the last login, over the form, only while offline.
    const notice = !connected && !connecting ? loginNotice : null;
    const aboutPassword = notice != null && PASSWORD_NOTICE.test(notice);

    // What a theme that takes the screen for the login keys on (Kuźnia hides the game under it).
    useLayoutEffect(() => {
        document.body.classList.toggle("auth-open", shown);
    }, [shown]);

    // A wrong password empties the field, ready to be typed again.
    useEffect(() => {
        const password = passwordRef.current;
        if (!aboutPassword || !password) return;
        password.value = "";
        password.dispatchEvent(new Event("input"));
    }, [aboutPassword, notice]);

    // Kuźnia: the password cools into dots as it is typed.
    useLayoutEffect(() => {
        if (passwordRef.current) forgeThePassword(passwordRef.current);
    }, []);

    // The permission prompt answers after the click.
    useEffect(() => {
        let status: PermissionStatus | null = null;
        navigator.permissions?.query({ name: "notifications" })
            .then((s) => {
                status = s;
                status.onchange = () => { if (notificationsGranted()) setNotifyHidden(true); };
            })
            .catch(() => undefined);
        return () => { if (status) status.onchange = null; };
    }, []);

    const dismiss = () => {
        connection.closeAuth();
        onDismissed?.();
    };
    const dismissRef = useRef(dismiss);
    dismissRef.current = dismiss;
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const { authClosed, connected, playback } = connection.getState();
            if (e.key === "Escape" && !authClosed && !connected && !playback) dismissRef.current();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [connection]);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        // Never leave the password shown once it is sent.
        setShowPassword(false);
        const character = characterRef.current?.value || "";
        const password = passwordRef.current?.value || "";

        // An e-mail opens the account rather than a character. Over telnet the
        // game asks for one in its own text menu, so only the direct connection
        // takes this road; the others type it in below like a name.
        if (character.includes("@") && getProxyMode() === "direct") {
            const { connected, connecting } = connection.getState();
            if (connected || connecting) return;
            connection.clearLoginNotice();
            accountSession.login(character.trim(), password);
            return;
        }

        connection.signIn({ character, password });
    };

    const togglePassword = () => {
        setShowPassword((show) => !show);
        passwordRef.current?.focus();
    };

    const enableNotifications = () => {
        client.enableNotifications();
        if (notificationsGranted()) setNotifyHidden(true);
    };

    const panelClass = [
        // Connecting: the form and the connect button give way to the spinner, which
        // also covers an e-mail login waiting for the game's answer.
        (connecting || account.loggingIn) && "is-connecting",
        account.view !== "off" && "is-account",
        proxyMode === "direct" && "is-direct",
        blocked && "is-blocked",
        aboutPassword && "has-password-error",
    ].filter(Boolean).join(" ");

    return (
        <div id="auth-overlay" style={{ display: shown ? "flex" : "none" }}>
            {/* Kuźnia: the forge burning behind the card (themes/forged/login.css shows it). */}
            <div className="auth-hearth"><i /><i /></div>
            <div className="auth-embers">
                {embers.map((vars, i) => <span key={i} className="auth-ember" style={vars as CSSProperties}><i /></span>)}
            </div>
            {/* The login screen's banner: gone once notifications are on, or for now on its cross. */}
            <div id="auth-notify" className="auth-notify" style={notifyHidden ? { display: "none" } : undefined}>
                <span className="auth-notify__icon"><svg {...icon}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg></span>
                <span className="auth-notify__text"><span>Powiadomienia wyłączone.</span> <span className="auth-dim auth-notify__more">Nie dowiesz się o wiadomościach, gdy karta jest w tle.</span></span>
                <button id="enable-notifications-connection" type="button" className="auth-btn auth-btn--sm" onClick={enableNotifications}>Włącz</button>
                <button id="auth-notify-dismiss" type="button" className="auth-ib auth-ib--sm" title="Nie teraz" onClick={() => setNotifyHidden(true)}>
                    <svg {...icon} width={12} height={12}><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
                </button>
            </div>
            <div className="auth-top">
                <button id="auth-close" type="button" className="auth-btn auth-btn--ghost auth-btn--sm" onClick={dismiss}>
                    Bez połączenia<svg {...icon} width={12} height={12}><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
                </button>
            </div>
            <section id="auth-panel" className={panelClass || undefined}>
                <img src="logo.png" className="auth-logo" alt="Dargoth Client" />
                <div className="auth-body">
                    <h1 className="auth-title auth-title-main">Wejdź do Arkadii</h1>
                    <div id="connecting-spinner"><span className="auth-spinner"></span>Łączenie…</div>
                    <div id="system-login-message">
                        {notice && (
                            <>
                                <svg {...icon}><path d="M12 3 2 21h20z"></path><path d="M12 10v4"></path><path d="M12 18h.01"></path></svg>
                                <div><strong>{notice}</strong><span>wiadomość od serwera gry</span></div>
                            </>
                        )}
                    </div>
                    <form id="login-form" onSubmit={submit}>
                        {/* .auth-rule and .auth-prompt draw the Kuźnia theme's ruled fields; elsewhere they are not there. */}
                        <label className="auth-field"><span className="auth-label">Postać albo e-mail konta</span>
                            <span className="auth-rule"><span className="auth-prompt">&gt;</span>
                                <input id="login-character" ref={characterRef} className="auth-input" type="text" autoComplete="username" spellCheck={false} autoFocus /></span></label>
                        <label className="auth-field"><span className="auth-label">Hasło</span>
                            <span className="auth-rule"><span className="auth-prompt">&gt;</span>
                                <span className="auth-pass">
                                    <input
                                        id="login-password"
                                        ref={passwordRef}
                                        type={showPassword ? "text" : "password"}
                                        autoComplete="current-password"
                                        placeholder={aboutPassword ? "Wpisz ponownie" : ""}
                                    />
                                    <button
                                        id="login-password-toggle"
                                        type="button"
                                        className={showPassword ? "auth-ib is-on" : "auth-ib"}
                                        title={showPassword ? "Ukryj hasło" : "Pokaż hasło"}
                                        onClick={togglePassword}
                                    >
                                        <svg {...icon} width={15} height={15}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                    </button>
                                </span></span></label>
                        <button id="login-submit" className="auth-btn auth-btn--solid auth-btn--lg" type="submit">Zaloguj</button>
                    </form>
                    <div id="create-account-row">
                        <span className="auth-dim">Nie masz konta?</span>
                        <button
                            id="create-account-link"
                            type="button"
                            className="auth-btn auth-btn--link"
                            onClick={() => { connection.clearLoginNotice(); accountSession.openCreateAccount(); }}
                        >
                            Załóż konto
                        </button>
                    </div>
                    {/* Konto: the screens that replace the card, while #auth-panel carries is-account. */}
                    <div id="account-root">
                        <Island name="AccountScreen"><AccountScreen session={accountSession} /></Island>
                    </div>
                    <div className="auth-or"><span></span>albo<span></span></div>
                    <button id="connect-button" type="button" className="auth-btn auth-btn--two" onClick={() => connection.toggle()}>
                        <span>Połącz bez logowania</span><span className="auth-muted">nowa postać albo logowanie w grze</span>
                    </button>
                </div>
                {/* Kuźnia folds the connection under a named hairline; elsewhere it is not there. */}
                <button
                    id="auth-conn-fold"
                    type="button"
                    className={connectionOpen ? "auth-fold is-open" : "auth-fold"}
                    onClick={() => setConnectionOpen((open) => !open)}
                >
                    <span className="auth-fold__name">Połączenie<svg className="auth-fold__chev" viewBox="0 0 10 6"><path d="M1 1.2 5 4.8 9 1.2" /></svg></span>
                </button>
                {/* The connection footer: the mode (direct / helper / proxy), what the helper is doing, and each mode's settings. */}
                <div id="proxy-controls-root" className={connectionOpen ? "auth-conn is-open" : "auth-conn"}>
                    <Island name="ProxyControls">
                        <ProxyControls
                            {...proxyControls}
                            onModeChange={(mode) => { setProxyMode(mode); proxyControls.onModeChange(mode); }}
                            onUseProxy={(url) => { proxyControls.onUseProxy(url); setProxyMode(getProxyMode()); }}
                            onBlockedChange={setBlocked}
                        />
                    </Island>
                </div>
            </section>
            <div className="auth-meta">
                <a className="auth-coffee" href="https://buycoffee.to/dargoth" target="_blank" rel="noopener noreferrer"><img src="https://buycoffee.to/static/img/share/share-button-primary--pl.png" alt="Postaw kawę dla dargoth na buycoffee.to" /></a>
                <Island name="CommitInfo"><CommitInfo /></Island>
            </div>
        </div>
    );
}
