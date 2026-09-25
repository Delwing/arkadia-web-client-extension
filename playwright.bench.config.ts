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
    // A full run (every variant × cap × CPU rate) takes well over the e2e suite's 20 min.
    globalTimeout: 90 * 60 * 1000,
    reporter: [['list']],
});
