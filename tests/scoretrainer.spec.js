const { test, expect, expectNoHorizontalOverflow, buildMidi } = require('./helpers/fixtures');

test.describe('Score Trainer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/scoretrainer/');
  });

  test('renders the upload view', async ({ page }) => {
    await expect(page).toHaveTitle(/Score Trainer/);
    await expect(page.locator('#viewUpload')).toBeVisible();
    await expect(page.locator('#dropZone')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('rejects unsupported files', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles({
      name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello'),
    });
    await expect(page.locator('.toast')).toContainText('Unsupported file format');
    await expect(page.locator('#viewUpload')).toBeVisible();
  });

  test('loads a MIDI file and plays random chunks', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles({
      name: 'scale.mid', mimeType: 'audio/midi', buffer: buildMidi(8),
    });

    // Config view: measures are detected from the file.
    await expect(page.locator('#viewConfig')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#configFilename')).toHaveText('scale.mid');
    await expect(page.locator('#configSummary')).toHaveText('MIDI · 8 measures detected');
    await expectNoHorizontalOverflow(page);

    // Play view: 8 measures / 4 per chunk = 2 chunks, rendered as SVG by OSMD.
    await page.locator('#startBtn').click();
    await expect(page.locator('#viewPlay')).toBeVisible();
    await expect(page.locator('#chunkTotal')).toHaveText('2');
    await expect(page.locator('#chunkRender svg').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#chunkRender')).not.toContainText('Render error');

    await page.locator('#nextBtn').click();
    await expect(page.locator('#chunkPos')).toHaveText('2');
    await expect(page.locator('#prevBtn')).toBeEnabled();

    await page.locator('#exitSessionBtn').click();
    await expect(page.locator('#viewConfig')).toBeVisible();

    // After a reload, the file can be reopened from the recent list.
    await page.reload();
    await page.locator('#recentList').getByText('scale.mid').click();
    await expect(page.locator('#configSummary')).toHaveText('MIDI · 8 measures detected', { timeout: 30_000 });
  });
});
