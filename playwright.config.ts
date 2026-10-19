import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    workers: 1,
    retries: 1,
    timeout: 120_000,
    reporter: [['html', { open: 'never' }], ['list']],
    expect: {
        timeout: 10_000,
    },
    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'desktop',
            use: {
                viewport: { width: 1280, height: 800 },
                browserName: 'chromium',
            },
        },
        {
            name: 'mobile',
            use: {
                viewport: { width: 375, height: 812 },
                browserName: 'chromium',
                isMobile: true,
            },
        },
    ],
    webServer: [
        {
            command: 'npx ts-node server/index.ts',
            port: 3001,
            reuseExistingServer: true,
            timeout: 30_000,
        },
        {
            command: 'npm run dev',
            port: 5173,
            reuseExistingServer: true,
            timeout: 30_000,
        },
    ],
});
