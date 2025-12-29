import type { User, AuthError } from 'firebase/auth';
import type { FirebaseAuthState } from './firebaseTypes';
import { FIREBASE_ERRORS, INITIAL_AUTH_STATE } from './firebaseTypes';
import { ensureFirebaseInitialized, getFirebaseAuth } from './firebaseConfig';

// Convert Firebase User to AuthState
function userToAuthState(user: User | null): FirebaseAuthState {
    if (!user) {
        return { ...INITIAL_AUTH_STATE, loading: false };
    }

    return {
        isAuthenticated: true,
        userId: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        providerId: user.providerData[0]?.providerId ?? null,
        loading: false,
        error: null,
    };
}

// Map Firebase auth errors to user-friendly messages
function mapAuthError(error: AuthError): string {
    const code = error.code;
    switch (code) {
        case 'auth/email-already-in-use':
            return FIREBASE_ERRORS.EMAIL_IN_USE;
        case 'auth/weak-password':
            return FIREBASE_ERRORS.WEAK_PASSWORD;
        case 'auth/invalid-email':
            return FIREBASE_ERRORS.INVALID_EMAIL;
        case 'auth/user-not-found':
            return FIREBASE_ERRORS.USER_NOT_FOUND;
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return FIREBASE_ERRORS.WRONG_PASSWORD;
        case 'auth/popup-blocked':
            return FIREBASE_ERRORS.POPUP_BLOCKED;
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
            return FIREBASE_ERRORS.POPUP_CLOSED;
        case 'auth/network-request-failed':
            return FIREBASE_ERRORS.NETWORK_ERROR;
        default:
            console.error('Firebase auth error:', code, error.message);
            return FIREBASE_ERRORS.AUTH_FAILED;
    }
}

// Get current auth state
export async function getCurrentAuthState(): Promise<FirebaseAuthState> {
    try {
        const { auth } = await ensureFirebaseInitialized();
        return userToAuthState(auth.currentUser);
    } catch {
        return { ...INITIAL_AUTH_STATE, loading: false };
    }
}

// Register with email and password
export async function registerWithEmail(email: string, password: string): Promise<FirebaseAuthState> {
    try {
        const { auth } = await ensureFirebaseInitialized();
        const { createUserWithEmailAndPassword } = await import('firebase/auth');
        console.log(`[Firebase AUTH] createUserWithEmailAndPassword`, { email });
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        return userToAuthState(credential.user);
    } catch (err) {
        const error = err as AuthError;
        return {
            ...INITIAL_AUTH_STATE,
            loading: false,
            error: mapAuthError(error),
        };
    }
}

// Sign in with email and password
export async function signInWithEmail(email: string, password: string): Promise<FirebaseAuthState> {
    try {
        const { auth } = await ensureFirebaseInitialized();
        const { signInWithEmailAndPassword } = await import('firebase/auth');
        console.log(`[Firebase AUTH] signInWithEmailAndPassword`, { email });
        const credential = await signInWithEmailAndPassword(auth, email, password);
        return userToAuthState(credential.user);
    } catch (err) {
        const error = err as AuthError;
        return {
            ...INITIAL_AUTH_STATE,
            loading: false,
            error: mapAuthError(error),
        };
    }
}

// Sign in with Google
export async function signInWithGoogle(): Promise<FirebaseAuthState> {
    try {
        const { auth } = await ensureFirebaseInitialized();
        const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
        const provider = new GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');
        console.log(`[Firebase AUTH] signInWithPopup (Google)`);
        const credential = await signInWithPopup(auth, provider);
        return userToAuthState(credential.user);
    } catch (err) {
        const error = err as AuthError;
        return {
            ...INITIAL_AUTH_STATE,
            loading: false,
            error: mapAuthError(error),
        };
    }
}

// Sign out
export async function signOut(): Promise<void> {
    const auth = getFirebaseAuth();
    if (auth) {
        const { signOut: firebaseSignOut } = await import('firebase/auth');
        console.log(`[Firebase AUTH] signOut`);
        await firebaseSignOut(auth);
    }
}

// Subscribe to auth state changes
export function onAuthStateChanged(callback: (state: FirebaseAuthState) => void): () => void {
    let unsubscribe: (() => void) | null = null;

    ensureFirebaseInitialized()
        .then(async ({ auth }) => {
            const { onAuthStateChanged: firebaseOnAuthStateChanged } = await import('firebase/auth');
            unsubscribe = firebaseOnAuthStateChanged(auth, (user) => {
                callback(userToAuthState(user));
            });
        })
        .catch(() => {
            callback({ ...INITIAL_AUTH_STATE, loading: false });
        });

    // Return cleanup function
    return () => {
        if (unsubscribe) {
            unsubscribe();
        }
    };
}

// Send password reset email
export async function sendPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { auth } = await ensureFirebaseInitialized();
        const { sendPasswordResetEmail } = await import('firebase/auth');
        console.log(`[Firebase AUTH] sendPasswordResetEmail`, { email });
        await sendPasswordResetEmail(auth, email);
        return { success: true };
    } catch (err) {
        const error = err as AuthError;
        return { success: false, error: mapAuthError(error) };
    }
}
