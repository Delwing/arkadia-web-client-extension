export function AuthOverlay() {
    return (
        <div id="auth-overlay">
            <button id="auth-close" className="overlay-close">
                ✖
            </button>
            <button id="enable-notifications-connection" className="btn btn-warning btn-sm">
                Wącz powiadomienia
            </button>
            <div id="auth-panel">
                <img src="logo.png" className="logo mb-3" />
                <div id="connecting-spinner" className="spinner-border text-light" />
                <button id="connect-button">Połącz</button>
                <div className="auth-or">- LUB -</div>
                <form id="login-form" className="d-flex flex-column gap-2">
                    <input id="login-character" className="form-control" placeholder="Postać" autoComplete="username" autoFocus />
                    <input
                        id="login-password"
                        type="password"
                        className="form-control"
                        placeholder="Hasło"
                        autoComplete="current-password"
                    />
                    <button id="login-submit" className="btn btn-primary" type="submit">
                        Zaloguj
                    </button>
                </form>
            </div>
            <div id="commit-info" />
        </div>
    );
}
