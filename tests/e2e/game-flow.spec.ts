import { test, expect } from '@playwright/test';

test.describe('Game Flow - Single Player', () => {
    test('complete match from lobby to result', async ({ page }) => {
        // 1. Navigate to lobby
        await page.goto('/?debug=1');
        await page.waitForLoadState('networkidle');

        // Verify lobby loaded
        await expect(page.locator('text=FORTRESS')).toBeVisible({ timeout: 10_000 });
        await page.screenshot({ path: 'tests/screenshots/01-lobby.png' });

        // 2. Enter player name if input visible
        const nameInput = page.locator('input[placeholder*="name" i], input[placeholder*="Name" i]');
        if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await nameInput.fill('TestBot');
        }

        // 3. Click TRAINING button (single-player mode)
        const trainingBtn = page.locator('button:has-text("TRAINING"), button:has-text("Training"), button:has-text("training"), button:has-text("SOLO")');
        await trainingBtn.first().click({ timeout: 10_000 });

        // 4. Wait for room/match setup
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'tests/screenshots/02-room.png' });

        // 5. Click READY if visible
        const readyBtn = page.locator('button:has-text("READY"), button:has-text("Ready")');
        if (await readyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await readyBtn.click();
        }

        // 6. Wait for build phase (canvas should be visible)
        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'tests/screenshots/03-build-phase.png' });

        // 7. Skip build phase by clicking DONE
        const doneBtn = page.locator('button:has-text("DONE"), button:has-text("Done")');
        if (await doneBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await doneBtn.click();
        }

        // 8. Wait for combat phase
        await page.waitForTimeout(8000); // reveal + transition
        await page.screenshot({ path: 'tests/screenshots/04-combat-phase.png' });

        // 9. Wait for match to complete (bot plays automatically)
        // The match can take up to 60 seconds with multiple turns
        const resultText = page.locator('text=/VICTORY|DEFEAT|DRAW/i');
        await expect(resultText).toBeVisible({ timeout: 90_000 });
        await page.screenshot({ path: 'tests/screenshots/05-result.png' });
    });

    test('lobby renders correctly', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Basic structure checks
        await expect(page.locator('text=FORTRESS')).toBeVisible({ timeout: 10_000 });

        // Check that lobby buttons exist
        const buttons = page.locator('button');
        const buttonCount = await buttons.count();
        expect(buttonCount).toBeGreaterThan(0);
    });
});
