const { test, expect, skipOnboarding, expectNoHorizontalOverflow } = require('./helpers/fixtures');

test.describe('Chord Trainer', () => {
  test('shows the onboarding tour on first visit and can skip it', async ({ page }) => {
    await page.goto('/');
    const overlay = page.locator('#onboardOverlay');
    await expect(overlay).toBeVisible();
    await page.locator('#onboardSkip').click();
    await expect(overlay).toBeHidden();

    // Stays dismissed after a reload.
    await page.reload();
    await expect(page.locator('#newChordBtn')).toBeVisible();
    await expect(overlay).toBeHidden();
  });

  test.describe('after onboarding', () => {
    test.beforeEach(async ({ page }) => {
      await skipOnboarding(page);
      await page.goto('/');
    });

    test('renders the main controls', async ({ page }) => {
      await expect(page).toHaveTitle(/Chord Trainer/);
      await expect(page.locator('#micBtn')).toBeVisible();
      await expect(page.locator('#midiBtn')).toBeVisible();
      await expect(page.locator('#newChordBtn')).toBeVisible();
      await expect(page.locator('#piano .key, #piano > *').first()).toBeAttached();
    });

    test('"New chord" displays a chord', async ({ page }) => {
      await page.locator('#newChordBtn').click();
      await expect(page.locator('#stageTrack')).not.toHaveText(/^\s*✓?\s*$/);
    });

    test('switches between piano and guitar', async ({ page }) => {
      await page.locator('#newChordBtn').click();

      await page.locator('.instrument-mode-btn[data-instrument="guitar"]').click();
      await expect(page.locator('.instrument-mode-btn[data-instrument="guitar"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#guitarWrap')).toBeVisible();
      await expect(page.locator('#guitarSvg > *').first()).toBeAttached();

      await page.locator('.instrument-mode-btn[data-instrument="piano"]').click();
      await expect(page.locator('.instrument-mode-btn[data-instrument="piano"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#pianoWrap')).toBeVisible();
    });

    test('has no horizontal scroll', async ({ page }) => {
      await page.locator('#newChordBtn').click();
      await expectNoHorizontalOverflow(page);
    });

    test('links to the Score Trainer', async ({ page }) => {
      await page.locator('.mode-pill a', { hasText: 'Score' }).click();
      await expect(page).toHaveURL(/\/scoretrainer\/$/);
      await expect(page.locator('#dropZone')).toBeVisible();
    });
  });
});
