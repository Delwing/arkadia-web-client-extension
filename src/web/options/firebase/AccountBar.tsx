import type { FirebaseAuthState } from "@modules/firebase";
import { Button } from "@web-ui/primitives/index.ts";

interface AccountBarProps {
    authState: FirebaseAuthState;
    onSignOut: () => void;
    disabled: boolean;
}

/** Who is signed in, the account id and the sign-out button. */
function AccountBar({ authState, onSignOut, disabled }: AccountBarProps) {
    return (
        <div className="firebase-sync__bar">
            <div>
                <span className="popup-muted popup-small">Zalogowany jako: </span>
                <span className="popup-strong">{authState.email ?? authState.displayName ?? 'Nieznany'}</span>
                {authState.userId && (
                    <div className="popup-muted popup-small">
                        {/* The account's documents in Firebase: users/{ID} */}
                        ID konta: <span className="firebase-sync__user-id">{authState.userId}</span>
                        {' '}
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void navigator.clipboard?.writeText(authState.userId!)}
                        >
                            Kopiuj
                        </Button>
                    </div>
                )}
            </div>
            <Button
                size="sm"
                onClick={onSignOut}
                disabled={disabled}
            >
                Wyloguj
            </Button>
        </div>
    );
}

export default AccountBar;
