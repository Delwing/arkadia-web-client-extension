import {defineConfig, devices} from '@playwright/test';

const PORT = Number(process.env.E2E_PORT) || 4173;

// GitHub's standard runners have 4 vCPUs. Running one Chromium per core leaves
// every worker fighting for CPU with the three others plus the preview server,
// which is what stretches a 6s test past its deadline. Half the cores is
// Playwright's own default and keeps each worker responsive; wall-clock is
// bought back with more shards instead.
const CI_WORKERS = Number(process.env.E2E_WORKERS) || 2;

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? CI_WORKERS : undefined,
    reporter: process.env.CI
        ? [['blob'], ['github'], ['junit', { outputFile: 'test-results/e2e-junit.xml' }]]
        : [['list'], ['html', { open: 'never' }]],
    // Booting the app (goto + socket handshake + Konva map render) costs a few
    // seconds before a test does anything, and several specs boot twice to check
    // what survives a reload. Keep the deadline well above that so a loaded CI
    // runner fails on real breakage, not on being busy. Timeouts only cost time
    // when a test is already failing.
    timeout: 30 * 1000,
    expect: { timeout: 10 * 1000 },
    globalTimeout: 20 * 60 * 1000,
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        trace: 'on-first-retry',
        // No actionTimeout/navigationTimeout on purpose: capping a click or a
        // goto below the test budget only moves the deadline earlier, which is
        // the failure mode being fixed here. Let them run against the test's own.
    },
    webServer: {
        command: 'yarn build && yarn preview --host 127.0.0.1 --port ' + PORT + ' --strictPort',
        url: `http://127.0.0.1:${PORT}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 180 * 1000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], screenshot: "only-on-failure" },
        },
    ],
});
