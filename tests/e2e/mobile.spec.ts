import { test, expect } from '@playwright/test';
import { startSinglePlayerMatch, skipBuildPhase } from './helpers';

test.describe('Mobile Layout', () => {
    test.use({ viewport: { width: 375, height: 812 }, isMobile: true });

    test('lobby renders without horizontal overflow', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Verify no horizontal scrollbar
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px tolerance

        // Verify key buttons are visible
        await expect(page.locator('button').filter({ hasText: /single player/i })).toBeVisible({ timeout: 10_000 });
        await page.screenshot({ path: 'tests/screenshots/mobile-lobby.png' });
    });

    test('canvas fills viewport during game', async ({ page }) => {
        await startSinglePlayerMatch(page);

        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible({ timeout: 15_000 });

        // Canvas should fill most of the viewport width
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
            expect(box.width).toBeGreaterThan(350); // Nearly full width on 375px viewport
        }

        await page.screenshot({ path: 'tests/screenshots/mobile-build-phase.png' });
    });

    test('phase overlay text fits on small screen', async ({ page }) => {
        await startSinglePlayerMatch(page);
        await skipBuildPhase(page);

        // Wait for combat
        await page.waitForTimeout(8000);

        // No horizontal overflow during combat
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

        await page.screenshot({ path: 'tests/screenshots/mobile-combat.png' });
    });

    test('mobile touch hint is visible during combat', async ({ page }) => {
        await startSinglePlayerMatch(page);
        await skipBuildPhase(page);
        await page.waitForTimeout(8000);

        // Mobile combat hint should be visible
        const hint = page.locator('text=/tap.*drag|aim.*fire/i');
        await expect(hint.first()).toBeVisible({ timeout: 15_000 });
    });
});
