import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Database } from 'firebase/database';
import type { FirebaseUserConfig } from './firebaseTypes';
import { loadFirebaseConfig, FIREBASE_ERRORS } from './firebaseTypes';

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firebaseDb: Firestore | null = null;
let isInitializing = false;
let initPromise: Promise<FirebaseApp> | null = null;

// Check if Firebase is initialized
export function isFirebaseInitialized(): boolean {
    return firebaseApp !== null;
}

// Get Firebase app instance
export function getFirebaseApp(): FirebaseApp | null {
    return firebaseApp;
}

// Get Firebase Auth instance
export function getFirebaseAuth(): Auth | null {
    return firebaseAuth;
}

// Get Firestore instance
export function getFirestore(): Firestore | null {
    return firebaseDb;
}

// Initialize Firebase with user config
export async function initializeFirebase(config?: FirebaseUserConfig): Promise<FirebaseApp> {
    // If already initialized, return existing app
    if (firebaseApp) {
        return firebaseApp;
    }

    // If initialization is in progress, wait for it
    if (isInitializing && initPromise) {
        return initPromise;
    }

    // Get config from parameter or localStorage
    const firebaseConfig = config ?? loadFirebaseConfig();
    if (!firebaseConfig) {
        throw new Error(FIREBASE_ERRORS.NOT_INITIALIZED);
    }

    isInitializing = true;

    initPromise = (async () => {
        try {
            // Dynamic imports to reduce bundle size
            const { initializeApp, getApps, getApp } = await import('firebase/app');
            const { getAuth } = await import('firebase/auth');
            const { getFirestore: getFirestoreDb } = await import('firebase/firestore');

            // Check if app already exists (e.g., from a previous session)
            const apps = getApps();
            if (apps.length > 0) {
                firebaseApp = getApp();
            } else {
                firebaseApp = initializeApp(firebaseConfig);
            }

            // Initialize Auth
            firebaseAuth = getAuth(firebaseApp);

            // Initialize Firestore
            firebaseDb = getFirestoreDb(firebaseApp);

            return firebaseApp;
        } catch (err) {
            console.error('Failed to initialize Firebase', err);
            firebaseApp = null;
            firebaseAuth = null;
            firebaseDb = null;
            // Re-throw with original error message for debugging
            const message = err instanceof Error ? err.message : FIREBASE_ERRORS.INVALID_CONFIG;
            throw new Error(message);
        } finally {
            isInitializing = false;
            initPromise = null;
        }
    })();

    return initPromise;
}

/**
 * Realtime Database URLs of the projects this client ships with. Saved configs
 * predate the `databaseURL` field, so the project id is what finds it.
 */
const KNOWN_DATABASE_URLS: Record<string, string> = {
    'dargoth-client': 'https://dargoth-client-default-rtdb.europe-west1.firebasedatabase.app',
};

/**
 * The Realtime Database, loaded on first use: only the session handoff needs it.
 *
 * The URL comes from the saved config, then `VITE_FIREBASE_DATABASE_URL`, then the
 * known URL for the project, and only then the SDK's own guess
 * (`{projectId}-default-rtdb.firebaseio.com`). That guess is right only for a
 * database in us-central1; for any other region the SDK refuses to connect.
 */
export async function getRealtimeDatabase(): Promise<{ api: typeof import('firebase/database'); db: Database; url: string | undefined } | null> {
    const app = firebaseApp;
    if (!app) return null;
    const api = await import('firebase/database');
    const config = loadFirebaseConfig();
    const url = config?.databaseURL
        ?? (import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined)
        ?? (config ? KNOWN_DATABASE_URLS[config.projectId] : undefined);
    return { api, db: url ? api.getDatabase(app, url) : api.getDatabase(app), url };
}

// Cleanup Firebase (for testing or config change)
export async function cleanupFirebase(): Promise<void> {
    if (firebaseApp) {
        try {
            const { deleteApp } = await import('firebase/app');
            await deleteApp(firebaseApp);
        } catch (err) {
            console.error('Failed to cleanup Firebase', err);
        }
    }
    firebaseApp = null;
    firebaseAuth = null;
    firebaseDb = null;
    isInitializing = false;
    initPromise = null;
}

// Ensure Firebase is initialized before use
export async function ensureFirebaseInitialized(): Promise<{ app: FirebaseApp; auth: Auth; db: Firestore }> {
    if (!firebaseApp || !firebaseAuth || !firebaseDb) {
        await initializeFirebase();
    }

    if (!firebaseApp || !firebaseAuth || !firebaseDb) {
        throw new Error(FIREBASE_ERRORS.NOT_INITIALIZED);
    }

    return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb };
}
