import { defineConfig } from 'vitest/config';

/**
 * Standalone test config.
 *
 * This file must exist even though its contents are nearly default: without it
 * Vitest walks up the directory tree, finds the main project's `vite.config.ts`,
 * and tries to build the web client's entry points (and load its setup file)
 * before running a single Worker test. `root` pins resolution here.
 *
 * Same arrangement as ../worker — each Worker is independent of the main Vite
 * build and of the other, with its own package.json and dependency tree.
 */
export default defineConfig({
    root: import.meta.dirname,
    test: {
        // Pure logic against Web-standard APIs (fetch, crypto.subtle), all of
        // which modern Node provides natively. The push encryption tests in
        // particular run entirely on WebCrypto, so no polyfill is needed — and
        // the suite must run fast and with no network access.
        environment: 'node',
        include: ['test/**/*.test.ts'],
        setupFiles: [],
        globals: false,
    },
});
