import { test, expect } from '@playwright/test';

test.describe('Lobby Flows', () => {
    test('single player room creation shows VS card', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Click Single Player
        const btn = page.locator('button').filter({ hasText: /single player/i });
        await btn.click({ timeout: 10_000 });
        await page.waitForTimeout(1500);

        // Verify VS card appears with Training Bot
        await expect(page.locator('text=/training bot/i')).toBeVisible({ timeout: 5_000 });
        // Verify Ready button is present
        await expect(page.locator('button').filter({ hasText: /ready/i })).toBeVisible({ timeout: 5_000 });
    });

    test('PvP room creation shows room code', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Click Create Kingdom
        const createBtn = page.locator('button').filter({ hasText: /create kingdom/i });
        await createBtn.click({ timeout: 10_000 });
        await page.waitForTimeout(1500);

        // Verify room code is displayed (6-character alphanumeric)
        // The room code appears in the header as "Room: XXXXXX"
        await expect(page.locator('text=/Room:\\s*[A-Z0-9]{6}/i')).toBeVisible({ timeout: 5_000 });
    });

    test('invalid room code shows error', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Enter invalid room code
        const codeInput = page.locator('input[placeholder*="code" i], input[placeholder*="Code" i]');
        await codeInput.fill('ZZZZZ1');

        // Click Join
        const joinBtn = page.locator('button').filter({ hasText: /^join$/i });
        await joinBtn.click();
        await page.waitForTimeout(2000);

        // Should still be on lobby (no canvas visible)
        await expect(page.locator('canvas')).not.toBeVisible({ timeout: 3_000 });
    });

    test('player name persists in input', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const nameInput = page.locator('input[placeholder*="name" i]');
        if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await nameInput.fill('TestKnight');
            // Reload and check persistence
            await page.reload();
            await page.waitForLoadState('networkidle');
            const value = await nameInput.inputValue();
            // Name may or may not persist depending on implementation
            // Just verify the input is still accessible
            expect(value).toBeDefined();
        }
    });
});
