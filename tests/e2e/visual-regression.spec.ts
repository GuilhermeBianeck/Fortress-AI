import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
    test('lobby appearance', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        await expect(page).toHaveScreenshot('lobby.png', {
            maxDiffPixelRatio: 0.05,
        });
    });

    test('game canvas renders', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Start training
        const trainingBtn = page.locator('button:has-text("TRAINING"), button:has-text("Training"), button:has-text("SOLO")');
        await trainingBtn.first().click({ timeout: 10_000 });

        await page.waitForTimeout(2000);
        const readyBtn = page.locator('button:has-text("READY"), button:has-text("Ready")');
        if (await readyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await readyBtn.click();
        }

        // Wait for canvas
        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(3000);

        // Screenshot just the canvas element (less flaky than full page)
        await expect(canvas).toHaveScreenshot('game-canvas.png', {
            maxDiffPixelRatio: 0.1, // Higher tolerance for animated content
        });
    });
});
