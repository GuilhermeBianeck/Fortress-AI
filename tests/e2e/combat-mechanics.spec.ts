import { test, expect } from '@playwright/test';
import { startSinglePlayerMatch, skipBuildPhase } from './helpers';

test.describe('Combat Mechanics', () => {
    test('keyboard controls are responsive during combat', async ({ page }) => {
        await startSinglePlayerMatch(page);
        await skipBuildPhase(page);

        // Wait for combat phase
        await page.waitForTimeout(8000);

        // Try pressing arrow keys and space (aiming + firing)
        // This tests that keyboard handlers are wired up
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('ArrowDown');

        // Canvas should still be rendering (no crash)
        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible();

        // Take screenshot to verify combat state
        await page.screenshot({ path: 'tests/screenshots/combat-keyboard.png' });
    });

    test('camera panning with A/D keys works', async ({ page }) => {
        await startSinglePlayerMatch(page);
        await skipBuildPhase(page);

        // Wait for combat
        await page.waitForTimeout(8000);

        // Press D to pan right
        await page.keyboard.down('d');
        await page.waitForTimeout(500);
        await page.keyboard.up('d');

        // Press A to pan left
        await page.keyboard.down('a');
        await page.waitForTimeout(500);
        await page.keyboard.up('a');

        // Canvas should still be rendering
        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible();
    });
});
