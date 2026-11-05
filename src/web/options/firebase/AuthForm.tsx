import { Button, Input } from "@web-ui/primitives/index.ts";
import GoogleLogo from "./GoogleLogo";
import type { FirebaseAuth } from "./useFirebaseAuth";

/** Sign in, register or reset the password, shown while nobody is signed in. */
function AuthForm({ auth }: { auth: FirebaseAuth }) {
    const {
        authState,
        authMode,
        selectMode,
        showReset,
        email,
        setEmail,
        password,
        setPassword,
        isAuthBusy,
        authError,
        resetSuccess,
        handleEmailAuth,
        handlePasswordReset,
        handleGoogleSignIn,
    } = auth;

    return (
        <div className="popup-stack">
            <p className="popup-muted firebase-sync__lead">
                Zaloguj się, aby synchronizować ustawienia między urządzeniami.
            </p>

            {authState.loading ? (
                <div className="popup-inline popup-muted">
                    <span className="popup-spinner" />
                    <span>Sprawdzanie sesji...</span>
                </div>
            ) : (
                <>
                    <div className="dialog-tabs">
                        <button
                            type="button"
                            className={`dialog-tab${authMode === 'login' ? ' is-active' : ''}`}
                            onClick={() => selectMode('login')}
                        >
                            Logowanie
                        </button>
                        <button
                            type="button"
                            className={`dialog-tab${authMode === 'register' ? ' is-active' : ''}`}
                            onClick={() => selectMode('register')}
                        >
                            Rejestracja
                        </button>
                    </div>

                    {authMode === 'reset' ? (
                        <form className="popup-stack firebase-auth-form" onSubmit={handlePasswordReset}>
                            <div className="popup-field">
                                <label className="popup-field__label">Email</label>
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    disabled={isAuthBusy}
                                    required
                                    autoComplete="username"
                                />
                                <span className="popup-field__hint">
                                    Podaj adres email powiązany z kontem.
                                </span>
                            </div>
                            <div className="popup-row">
                                <Button variant="solid" type="submit" disabled={isAuthBusy}>
                                    {isAuthBusy ? (
                                        <span className="popup-inline">
                                            <span className="popup-spinner" />
                                            <span>Wysyłanie...</span>
                                        </span>
                                    ) : (
                                        'Wyślij link resetujący'
                                    )}
                                </Button>
                                <Button variant="ghost"
                                    size="sm"
                                    onClick={() => selectMode('login')}
                                >
                                    Powrót do logowania
                                </Button>
                            </div>
                        </form>
                    ) : (
                        <form className="popup-stack firebase-auth-form" onSubmit={handleEmailAuth}>
                            <div className="popup-field">
                                <label className="popup-field__label">Email</label>
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    disabled={isAuthBusy}
                                    required
                                    autoComplete="username"
                                />
                            </div>
                            <div className="popup-field">
                                <label className="popup-field__label">Hasło</label>
                                <Input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    disabled={isAuthBusy}
                                    required
                                    minLength={6}
                                    autoComplete="current-password"
                                />
                            </div>
                            {authMode === 'login' && (
                                <button type="button" className="popup-link ui-settings-self-start" onClick={showReset}>
                                    Nie pamiętam hasła
                                </button>
                            )}
                            <div className="popup-row">
                                <Button variant="solid" type="submit" disabled={isAuthBusy}>
                                    {isAuthBusy ? (
                                        <span className="popup-inline">
                                            <span className="popup-spinner" />
                                            <span>{authMode === 'login' ? 'Logowanie...' : 'Rejestracja...'}</span>
                                        </span>
                                    ) : (
                                        authMode === 'login' ? 'Zaloguj się' : 'Zarejestruj się'
                                    )}
                                </Button>
                                <Button onClick={handleGoogleSignIn} disabled={isAuthBusy}>
                                    {isAuthBusy ? (
                                        <span className="popup-spinner" />
                                    ) : (
                                        <>
                                            <GoogleLogo size={16} />
                                            <span>Zaloguj przez Google</span>
                                        </>
                                    )}
                                </Button>
                            </div>
                        </form>
                    )}
                </>
            )}

            {resetSuccess && (
                <div className="popup-notice popup-notice--success">
                    {resetSuccess}
                </div>
            )}

            {authError && (
                <div className="popup-notice popup-notice--danger">
                    {authError}
                </div>
            )}
        </div>
    );
}

export default AuthForm;
