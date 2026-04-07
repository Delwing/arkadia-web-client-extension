/**
 * Firebase Test Fixtures
 *
 * Special fixture for testing Firebase sync scenarios.
 * Uses mock Firebase instead of disabling it.
 */

import { test as base, expect } from '@playwright/test';
import {
    installMockWebSocket,
    mockGithubDeployments,
    mockKnowledgeDownload,
    mockMagicKeysDownload,
    mockMagicsDownload,
    mockMapDownloads,
    mockMapReleaseVersion,
    mockNpcDownload,
    mockPeopleDownload,
    mockWiedzaDownload,
} from './mocks';
import { installMockFirebase } from './firebase-mocks';

/**
 * Firebase test fixture - enables mock Firebase instead of disabling it
 */
const test = base.extend({
    context: async ({ context }, use) => {
        // Block external network requests that can stall page load
        await context.route(/googletagmanager\.com|google-analytics\.com|buycoffee\.to|fonts\.googleapis\.com|fonts\.gstatic\.com/, route => route.abort());

        // Disable Google Analytics but NOT Firebase
        await context.addInitScript(() => {
            // @ts-expect-error for disabling GA
            window.__DISABLE_GA__ = true;
        });

        // Install mock Firebase
        await installMockFirebase(context);

        // Install mock Firebase SDK interceptor
        await context.addInitScript(() => {
            // Store for mock Firestore data
            if (!(window as any).__MOCK_FIRESTORE_DATA__) {
                (window as any).__MOCK_FIRESTORE_DATA__ = {};
            }
            if (!(window as any).__FIREBASE_OPERATIONS__) {
                (window as any).__FIREBASE_OPERATIONS__ = [];
            }

            // Mock the firebase/firestore module
            const mockFirestore = {
                doc: (db: any, ...pathSegments: string[]) => {
                    const path = pathSegments.join('/');
                    return { path, db };
                },
                getDoc: async (docRef: { path: string }) => {
                    (window as any).__FIREBASE_OPERATIONS__.push({
                        type: 'read',
                        path: docRef.path,
                        timestamp: Date.now(),
                    });
                    const data = (window as any).__MOCK_FIRESTORE_DATA__[docRef.path];
                    return {
                        exists: () => !!data,
                        data: () => data,
                    };
                },
                setDoc: async (docRef: { path: string }, data: any, options?: { merge?: boolean }) => {
                    (window as any).__FIREBASE_OPERATIONS__.push({
                        type: 'setDoc',
                        path: docRef.path,
                        data,
                        merge: options?.merge,
                        timestamp: Date.now(),
                    });

                    if (options?.merge) {
                        const existing = (window as any).__MOCK_FIRESTORE_DATA__[docRef.path] || {};
                        // Deep merge for nested objects like categories.killCounts
                        const merged = { ...existing };
                        for (const key of Object.keys(data)) {
                            if (key.includes('.')) {
                                // Handle dot notation (e.g., "categories.killCounts")
                                const parts = key.split('.');
                                let target = merged;
                                for (let i = 0; i < parts.length - 1; i++) {
                                    target[parts[i]] = target[parts[i]] || {};
                                    target = target[parts[i]];
                                }
                                target[parts[parts.length - 1]] = data[key];
                            } else {
                                merged[key] = data[key];
                            }
                        }
                        (window as any).__MOCK_FIRESTORE_DATA__[docRef.path] = merged;
                    } else {
                        (window as any).__MOCK_FIRESTORE_DATA__[docRef.path] = data;
                    }
                },
                updateDoc: async (docRef: { path: string }, data: any) => {
                    (window as any).__FIREBASE_OPERATIONS__.push({
                        type: 'updateDoc',
                        path: docRef.path,
                        data,
                        timestamp: Date.now(),
                    });
                    const existing = (window as any).__MOCK_FIRESTORE_DATA__[docRef.path] || {};
                    (window as any).__MOCK_FIRESTORE_DATA__[docRef.path] = { ...existing, ...data };
                },
                deleteField: () => ({ __deleteField: true }),
                serverTimestamp: () => new Date().toISOString(),
            };

            // Mock the firebase/auth module
            const mockAuth = {
                getAuth: () => ({
                    currentUser: (window as any).__MOCK_AUTH_USER__,
                    onAuthStateChanged: (callback: (user: any) => void) => {
                        // Initial call
                        setTimeout(() => callback((window as any).__MOCK_AUTH_USER__), 0);

                        // Listen for changes
                        const handler = (e: CustomEvent) => callback(e.detail);
                        window.addEventListener('mock-firebase-auth-change', handler as any);
                        return () => window.removeEventListener('mock-firebase-auth-change', handler as any);
                    },
                }),
                signInWithPopup: async () => {
                    const user = (window as any).__MOCK_AUTH_USER__;
                    return { user };
                },
                signOut: async () => {
                    (window as any).__MOCK_AUTH_USER__ = null;
                    window.dispatchEvent(new CustomEvent('mock-firebase-auth-change', { detail: null }));
                },
                GoogleAuthProvider: class {
                    static PROVIDER_ID = 'google.com';
                },
            };

            // Store mocks for dynamic import interception
            (window as any).__FIREBASE_MOCKS__ = {
                firestore: mockFirestore,
                auth: mockAuth,
            };
        });

        // Standard mocks
        await mockMapDownloads(context);
        await mockMapReleaseVersion(context);
        await mockMagicsDownload(context);
        await mockMagicKeysDownload(context);
        await mockNpcDownload(context);
        await mockPeopleDownload(context);
        await mockKnowledgeDownload(context);
        await mockWiedzaDownload(context);
        await mockGithubDeployments(context);
        await installMockWebSocket(context);

        await use(context);
    },
});

export { expect, test };
