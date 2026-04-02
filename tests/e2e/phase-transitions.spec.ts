import { test, expect } from '@playwright/test';
import { startSinglePlayerMatch, skipBuildPhase } from './helpers';

test.describe('Phase Transitions', () => {
    test('build phase shows timer and done button', async ({ page }) => {
        await startSinglePlayerMatch(page);

        // Should be in build phase - look for build-related UI elements
        // The timer and DONE button should be visible
        const doneBtn = page.locator('button').filter({ hasText: /done/i });
        await expect(doneBtn).toBeVisible({ timeout: 10_000 });

        // Canvas should be rendering
        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible();
    });

    test('clicking DONE advances past build phase', async ({ page }) => {
        await startSinglePlayerMatch(page);

        // Click DONE to skip build
        await skipBuildPhase(page);

        // Wait for combat phase indicators
        // After build, there's a reveal phase (~5s), then combat
        await page.waitForTimeout(8000);

        // Should see combat-related text (YOUR TURN or OPPONENT'S TURN)
        const combatText = page.locator('text=/turn|fire/i');
        await expect(combatText.first()).toBeVisible({ timeout: 15_000 });
    });

    test('combat phase shows turn indicator', async ({ page }) => {
        await startSinglePlayerMatch(page);
        await skipBuildPhase(page);

        // Wait for combat
        await page.waitForTimeout(8000);

        // Should show turn indicator
        const turnText = page.locator('text=/your turn|opponent/i');
        await expect(turnText.first()).toBeVisible({ timeout: 15_000 });
    });
});
