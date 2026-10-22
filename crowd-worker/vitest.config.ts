import { defineConfig } from 'vitest/config';

/**
 * Standalone test config — without it Vitest walks up to the web client's
 * `vite.config.ts` and tries to build that first. Same arrangement as
 * ../push-worker.
 */
export default defineConfig({
    root: import.meta.dirname,
    test: {
        // D1 is stood in for by node:sqlite (test/fakeD1.ts), which is the same
        // SQLite engine D1 runs, so the SQL under test is the SQL that ships.
        environment: 'node',
        include: ['test/**/*.test.ts'],
        setupFiles: [],
        globals: false,
    },
});
