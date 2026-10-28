import {defineConfig, devices} from '@playwright/test';

// Line-throughput profiling (`yarn perf`), kept apart from the e2e suite: it is a
// measurement, not a pass/fail check, and wants an unminified build so the CPU
// profiles it writes name real functions.
const PORT = Number(process.env.PERF_PORT) || 4183;

export default defineConfig({
    testDir: './e2e/perf',
    testMatch: '**/*.perf.ts',
    workers: 1,
    reporter: [['list']],
    timeout: 5 * 60 * 1000,
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        launchOptions: {
            // The repo pins @playwright/test; point this at any Chromium when the
            // matching browser build is not installed.
            executablePath: process.env.PERF_CHROMIUM || undefined,
        },
    },
    webServer: {
        command: `yarn vite build --minify false && yarn preview --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: `http://127.0.0.1:${PORT}/`,
        reuseExistingServer: false,
        timeout: 300 * 1000,
        stdout: 'ignore',
        stderr: 'pipe',
    },
    projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
});
