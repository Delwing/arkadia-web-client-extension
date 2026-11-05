import { useCallback, useEffect, useState } from "react";
import { initializeFirebase, loadFirebaseConfig, saveFirebaseConfig } from "@modules/firebase";

// Default Firebase config - will be used if not overridden
const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyCLzwBiOJQQ8KoKEeVn6XUksa1pvqtrQsw",
    authDomain: "dargoth-client.firebaseapp.com",
    projectId: "dargoth-client",
    storageBucket: "dargoth-client.firebasestorage.app",
    databaseURL: "https://dargoth-client-default-rtdb.europe-west1.firebasedatabase.app",
    messagingSenderId: "297724157458",
    appId: "1:297724157458:web:02a8c5258caedbad4642cb",
    measurementId: "G-0WGG26XZB2"
};

/** Initializes Firebase on mount (saving the default config on first use); `retry` runs it again. */
export function useFirebaseInit() {
    const [isConfigured, setIsConfigured] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);
    const [initError, setInitError] = useState<string | null>(null);

    const retry = useCallback(async () => {
        // Skip Firebase initialization in test environment
        if ((window as { __DISABLE_FIREBASE__?: boolean }).__DISABLE_FIREBASE__) {
            setIsInitializing(false);
            setInitError('Firebase disabled in test environment');
            return;
        }

        setIsInitializing(true);
        setInitError(null);
        try {
            // Try to load existing config or use default
            let config = loadFirebaseConfig();
            if (!config) {
                // Use default config
                config = DEFAULT_FIREBASE_CONFIG;
                saveFirebaseConfig(config);
            }

            await initializeFirebase(config);
            setIsConfigured(true);
        } catch (err) {
            console.error('Failed to initialize Firebase', err);
            setIsConfigured(false);
            setInitError(err instanceof Error ? err.message : 'Nieznany błąd');
        } finally {
            setIsInitializing(false);
        }
    }, []);

    useEffect(() => {
        retry();
    }, [retry]);

    return { isConfigured, isInitializing, initError, retry };
}
