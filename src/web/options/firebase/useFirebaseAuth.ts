import { useEffect, useState } from "react";
import {
    type FirebaseAuthState,
    INITIAL_AUTH_STATE,
    FIREBASE_ERRORS,
    onAuthStateChanged,
    getCurrentAuthState,
    signInWithEmail,
    signInWithGoogle,
    registerWithEmail,
    signOut,
    sendPasswordReset,
} from "@modules/firebase";

export type AuthMode = 'login' | 'register' | 'reset';

/**
 * The Firebase account: the auth state once Firebase `isConfigured`, and the
 * sign-in / register / password-reset form. `onSignedIn` runs on every auth
 * change that has a signed-in user; keep it stable.
 */
export function useFirebaseAuth(isConfigured: boolean, onSignedIn: (userId: string) => void) {
    const [authState, setAuthState] = useState<FirebaseAuthState>(INITIAL_AUTH_STATE);
    const [authMode, setAuthMode] = useState<AuthMode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isAuthBusy, setIsAuthBusy] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [resetSuccess, setResetSuccess] = useState<string | null>(null);

    // Subscribe to auth state changes
    useEffect(() => {
        if (!isConfigured) return;

        // Get current auth state immediately
        getCurrentAuthState().then(state => {
            setAuthState(state);
        });

        // Subscribe to future changes
        const unsubscribe = onAuthStateChanged((state) => {
            setAuthState(state);
            if (state.isAuthenticated && state.userId) onSignedIn(state.userId);
        });

        return () => unsubscribe();
    }, [isConfigured, onSignedIn]);

    /** Switches between the login / register / reset forms, clearing their notices. */
    const selectMode = (mode: AuthMode) => {
        setAuthMode(mode);
        setAuthError(null);
        setResetSuccess(null);
    };

    /** "Forgot password": the reset form. */
    const showReset = () => {
        setAuthMode('reset');
        setAuthError(null);
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(null);
        setIsAuthBusy(true);

        try {
            let result: FirebaseAuthState;
            if (authMode === 'register') {
                result = await registerWithEmail(email, password);
            } else {
                result = await signInWithEmail(email, password);
            }

            if (result.error) {
                setAuthError(result.error);
            } else {
                setEmail('');
                setPassword('');
            }
        } catch {
            setAuthError(FIREBASE_ERRORS.AUTH_FAILED);
        } finally {
            setIsAuthBusy(false);
        }
    };

    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(null);
        setResetSuccess(null);
        setIsAuthBusy(true);

        try {
            const result = await sendPasswordReset(email);
            if (result.success) {
                setResetSuccess('Link do resetowania hasła został wysłany na podany adres email.');
                setEmail('');
            } else {
                setAuthError(result.error ?? FIREBASE_ERRORS.AUTH_FAILED);
            }
        } catch {
            setAuthError(FIREBASE_ERRORS.AUTH_FAILED);
        } finally {
            setIsAuthBusy(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setAuthError(null);
        setIsAuthBusy(true);

        try {
            const result = await signInWithGoogle();
            if (result.error) {
                setAuthError(result.error);
            }
        } catch {
            setAuthError(FIREBASE_ERRORS.AUTH_FAILED);
        } finally {
            setIsAuthBusy(false);
        }
    };

    /** Signs out; `afterSignOut` clears what belonged to the account once that succeeded. */
    const handleSignOut = async (afterSignOut: () => void) => {
        setAuthError(null);
        setIsAuthBusy(true);

        try {
            await signOut();
            afterSignOut();
        } catch (err) {
            console.error('Sign out failed', err);
        } finally {
            setIsAuthBusy(false);
        }
    };

    return {
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
        handleSignOut,
    };
}

export type FirebaseAuth = ReturnType<typeof useFirebaseAuth>;
