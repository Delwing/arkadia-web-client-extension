import {defineConfig, devices} from '@playwright/test';

const PORT = 4173;

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? '100%' : undefined,
    reporter: process.env.CI
        ? [['blob'], ['junit', { outputFile: 'test-results/e2e-junit.xml' }]]
        : [['list'], ['html', { open: 'never' }]],
    timeout: 10 * 1000,
    globalTimeout: 10 * 60 * 1000,
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        trace: 'on-first-retry',
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
