import { test, expect } from '@playwright/test';

test.describe('mobile app navigation surfaces', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  async function exposeMobileShellForUiTest(page) {
    await page.evaluate(async () => {
      const { store } = await import('/src/js/store.js');
      // Test-only signed-in state so Account opens the account modal,
      // instead of redirecting to the auth gate.
      store.currentUser = {
        id: "test-user",
        email: "test@example.com"
      };

      store.currentSession = {
        user: store.currentUser,
        access_token: "test-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600
      };

      store.cloudReady = true;
      store.cloudLoadSucceeded = true;

      document.body.classList.remove(
        'auth-required',
        'auth-loading',
        'setup-required',
        'modal-open',
        'mobile-more-open'
      );

      const authGate = document.getElementById('auth-gate');
      if (authGate) authGate.style.display = 'none';

      const setupModal = document.getElementById('course-setup-modal');
      if (setupModal) setupModal.classList.add('hidden');

      window.ensureMobileUxShell?.();
      window.syncMobileUxShell?.();
    });
  }

  test('bottom tabs open and close mobile surfaces naturally', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => {
      return typeof window.ensureMobileUxShell === 'function' &&
        document.querySelector('.mobile-tabbar') &&
        document.querySelector('.mobile-more-sheet') &&
        document.querySelector('#timeline-modal') &&
        document.querySelector('#todo-modal') &&
        document.querySelector('#prefs-panel') &&
        document.querySelector('#auth-modal');
    });

    await exposeMobileShellForUiTest(page);
    await page.waitForTimeout(100);
    await exposeMobileShellForUiTest(page);

    const datesButton = page.locator('.mobile-tab-btn[data-mobile-tab="deadlines"]');
    const planButton = page.locator('.mobile-tab-btn[data-mobile-tab="planner"]');
    const moreButton = page.locator('.mobile-tab-btn[data-mobile-tab="more"]');
    const moreSheet = page.locator('.mobile-more-sheet');

    const timeline = page.locator('#timeline-modal');
    const planner = page.locator('#todo-modal');
    const prefsPanel = page.locator('#prefs-panel');
    const accountModal = page.locator('#auth-modal');

    await expect(datesButton).toBeVisible();

    await datesButton.click();
    await expect(timeline).not.toHaveClass(/hidden/);

    await datesButton.click();
    await expect(timeline).toHaveClass(/hidden/);

    await planButton.click();
    await expect(planner).not.toHaveClass(/hidden/);

    await planButton.click();
    await expect(planner).toHaveClass(/hidden/);

    await moreButton.click();
    await expect(moreSheet).toBeVisible();

    await page.locator('.mobile-more-action[data-mobile-action="preferences"]').click();
    await expect(prefsPanel).not.toHaveClass(/hidden/);

    await moreButton.click();
    await expect(prefsPanel).toHaveClass(/hidden/);
    await expect(moreSheet).toBeVisible();

    await page.locator('.mobile-more-action[data-mobile-action="account"]').click();
    await expect(accountModal).not.toHaveClass(/hidden/);

    await moreButton.click();
    await expect(accountModal).toHaveClass(/hidden/);
    await expect(moreSheet).toBeVisible();

    await page.locator('.mobile-more-action[data-mobile-action="add-module"]').click();
    await expect(moreButton).toBeVisible();
  });
});
