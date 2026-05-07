import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    testIgnore: ['unit/**/*.test.js'],
    timeout: 30_000,

    use: {
        baseURL: 'http://127.0.0.1:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },

    webServer: {
        command: 'npm.cmd run dev -- --host 127.0.0.1',
        env: {
            VITE_SUPABASE_URL: 'https://unitrack-test.supabase.co',
            VITE_SUPABASE_ANON_KEY: 'unitrack-test-anon-key',
        },
        url: 'http://127.0.0.1:3000',
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
    },

    projects: [
        {
            name: 'desktop-chrome',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile-safari',
            use: { ...devices['iPhone 13'] },
        },
    ],
});
