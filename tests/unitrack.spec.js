const { test, expect } = require('@playwright/test');

async function expectAuthGate(page) {
    await expect(page.getByText('Welcome back!')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Forgot Password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
}

test.describe('UniTrack smoke tests', () => {
    test('app loads without crashing', async ({ page }) => {
        await page.goto('/');

        await expect(page.locator('body')).toBeVisible();
        await expect(page.locator('.auth-gate-card')).toBeVisible();
        await expect(page.getByText('Welcome back!')).toBeVisible();
    });

    test('signed-out auth gate loads correctly', async ({ page }) => {
        await page.goto('/');
        await expectAuthGate(page);
    });
});

test.describe('UniTrack auth UI', () => {
    test('forgot password flow opens and returns to sign in', async ({ page }) => {
        await page.goto('/');

        await expectAuthGate(page);

        await page.getByRole('button', { name: 'Forgot Password' }).click();

        await expect(page.getByText('Reset your password')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Send Reset Email' })).toBeVisible();

        await page.getByRole('button', { name: 'Back' }).click();

        await expect(page.getByText('Welcome back!')).toBeVisible();
    });

    test('forgot password validates empty email', async ({ page }) => {
        await page.goto('/');

        await page.getByRole('button', { name: 'Forgot Password' }).click();
        await page.getByRole('button', { name: 'Send Reset Email' }).click();

        await expect(page.getByText(/Enter your email first|valid email/i)).toBeVisible();
    });

    test('forgot password validates invalid email', async ({ page }) => {
        await page.goto('/');

        await page.getByRole('button', { name: 'Forgot Password' }).click();
        await page.getByLabel('Email').fill('not-an-email');
        await page.getByRole('button', { name: 'Send Reset Email' }).click();

        await expect(page.getByText(/valid email/i)).toBeVisible();
    });

    test('create account tab opens', async ({ page }) => {
        await page.goto('/');

        await page.getByRole('button', { name: 'Create Account' }).click();

        await expect(page.getByText('Create your account')).toBeVisible();
        await expect(page.getByLabel('Confirm Password')).toBeVisible();
    });

    test('create account validates password mismatch', async ({ page }) => {
        await page.goto('/');

        await page.getByRole('button', { name: 'Create Account' }).click();

        await page.getByLabel('Email').fill('test@example.com');
        await page.getByLabel('Password', { exact: true }).fill('password123');
        await page.getByLabel('Confirm Password').fill('different123');

        await page.getByRole('button', { name: 'Create Account' }).last().click();

        await expect(page.getByText(/Passwords do not match/i)).toBeVisible();
    });

    test('show password button toggles password visibility', async ({ page }) => {
        await page.goto('/');

        const passwordInput = page.getByLabel('Password');
        await expect(passwordInput).toHaveAttribute('type', 'password');

        await page.getByRole('button', { name: 'Show Password' }).click();
        await expect(passwordInput).toHaveAttribute('type', 'text');

        await page.getByRole('button', { name: 'Hide Password' }).click();
        await expect(passwordInput).toHaveAttribute('type', 'password');
    });
});

test.describe('UniTrack reset redirect behaviour', () => {
    test('forgot password request does not redirect to Vercel preview URL', async ({ page }) => {
        let recoverRequestText = '';

        await page.route('**/*', async (route) => {
            const request = route.request();
            const url = request.url();

            if (url.includes('/auth/v1/recover')) {
                recoverRequestText = [
                    url,
                    request.postData() || '',
                    JSON.stringify(request.headers()),
                ].join('\n');

                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: '{}',
                });

                return;
            }

            await route.continue();
        });

        await page.goto('/');

        await page.getByRole('button', { name: 'Forgot Password' }).click();
        await page.getByLabel('Email').fill('test@example.com');
        await page.getByRole('button', { name: 'Send Reset Email' }).click();

        await expect(page.getByText(/Check your email/i)).toBeVisible();

        expect(recoverRequestText).toBeTruthy();
        expect(recoverRequestText).not.toContain('vercel.app');
        expect(decodeURIComponent(recoverRequestText)).toContain('https://unitrack.uk');
    });
});

test.describe('UniTrack responsive layout', () => {
    test('desktop page has no horizontal overflow', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/');

        const overflow = await page.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });

        expect(overflow).toBe(false);
    });

    test('mobile page has no horizontal overflow', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/');

        const overflow = await page.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });

        expect(overflow).toBe(false);
    });

    test('auth gate is usable on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/');

        await expect(page.getByText('Welcome back!')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Forgot Password' })).toBeVisible();

        await page.getByRole('button', { name: 'Create Account' }).click();
        await expect(page.getByText('Create your account')).toBeVisible();
    });
});

test.describe('UniTrack keyboard/basic accessibility checks', () => {
    test('auth inputs are reachable and labelled', async ({ page }) => {
        await page.goto('/');

        await expect(page.getByLabel('Email')).toBeVisible();
        await expect(page.getByLabel('Password')).toBeVisible();

        await page.getByLabel('Email').fill('student@example.com');
        await page.getByLabel('Password').fill('password123');

        await expect(page.getByLabel('Email')).toHaveValue('student@example.com');
        await expect(page.getByLabel('Password')).toHaveValue('password123');
    });

    test('enter key from forgot password email field attempts reset', async ({ page }) => {
        await page.goto('/');

        await page.route('**/auth/v1/recover**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: '{}',
            });
        });

        await page.getByRole('button', { name: 'Forgot Password' }).click();
        await page.getByLabel('Email').fill('test@example.com');
        await page.keyboard.press('Enter');

        await expect(page.getByText(/Check your email/i)).toBeVisible();
    });
});

test.describe('UniTrack visual sanity checks', () => {
    test('important auth buttons are visible and not disabled', async ({ page }) => {
        await page.goto('/');

        await expect(page.getByRole('button', { name: 'Forgot Password' })).toBeEnabled();
        await expect(page.getByRole('button', { name: 'Show Password' })).toBeEnabled();
        await expect(page.getByRole('button', { name: 'Sign In' }).last()).toBeEnabled();
    });

    test('page background and auth card render', async ({ page }) => {
        await page.goto('/');

        await expect(page.locator('.auth-gate-card')).toBeVisible();
        await expect(page.locator('.auth-gate-tabs')).toBeVisible();
    });
});