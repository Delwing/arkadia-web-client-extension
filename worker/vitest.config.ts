import { defineConfig } from 'vitest/config';

/**
 * Standalone test config.
 *
 * This file must exist even though its contents are nearly default: without it
 * Vitest walks up the directory tree, finds the main project's `vite.config.ts`,
 * and tries to build the web client's entry points (and load its setup file)
 * before running a single Worker test. `root` pins resolution here.
 *
 * The Worker project is deliberately independent of the main Vite build — it has
 * its own package.json, its own dependency tree, and shares no build config.
 */
export default defineConfig({
    root: import.meta.dirname,
    test: {
        // Pure logic against Web-standard APIs (fetch, crypto.subtle, streams), all
        // of which modern Node provides natively. No jsdom, no Workers pool — the
        // suite must run fast and with no network access.
        environment: 'node',
        include: ['test/**/*.test.ts'],
        setupFiles: [],
        globals: false,
    },
});
