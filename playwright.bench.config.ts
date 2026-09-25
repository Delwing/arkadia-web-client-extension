import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Benchmarks: `yarn bench:output`. Same server and fixtures as the e2e suite,
 * but only `*.bench.ts`, one at a time (no CPU contention between workers),
 * and never part of CI.
 */
export default defineConfig({
    ...base,
    testMatch: /.*\.bench\.ts$/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 5 * 60 * 1000,
    reporter: [['list']],
});
