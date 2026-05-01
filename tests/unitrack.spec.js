const { test, expect } = require('@playwright/test');

test('UniTrack auth gate and forgot password flow works', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Welcome back!')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Forgot Password' })).toBeVisible();

    await page.getByRole('button', { name: 'Forgot Password' }).click();

    await expect(page.getByText('Reset your password')).toBeVisible();

    await page.getByRole('button', { name: 'Back' }).click();

    await expect(page.getByText('Welcome back!')).toBeVisible();
});

test('UniTrack create account tab opens', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText(/Create your account/i)).toBeVisible();
});

test('UniTrack page does not horizontally overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/');

    const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(overflow).toBe(false);
});