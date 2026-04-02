import { test, expect } from '@playwright/test';

test.describe('Performance', () => {
    test('maintains acceptable FPS during gameplay', async ({ page }) => {
        // Start a single-player game
        await page.goto('/?debug=1');
        await page.waitForLoadState('networkidle');

        // Start training match
        const trainingBtn = page.locator('button:has-text("TRAINING"), button:has-text("Training"), button:has-text("SOLO")');
        await trainingBtn.first().click({ timeout: 10_000 });

        // Wait for room and ready up
        await page.waitForTimeout(2000);
        const readyBtn = page.locator('button:has-text("READY"), button:has-text("Ready")');
        if (await readyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await readyBtn.click();
        }

        // Wait for canvas to be active (build phase)
        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(3000); // Let rendering stabilize

        // Measure FPS over 2 seconds using rAF
        const fpsResult = await page.evaluate(() => {
            return new Promise<{ fps: number; avgFrameMs: number; minFps: number }>((resolve) => {
                const times: number[] = [];
                let last = performance.now();
                let n = 0;

                function tick(now: number) {
                    times.push(now - last);
                    last = now;
                    if (++n >= 120) {
                        const avg = times.reduce((a, b) => a + b) / times.length;
                        const maxDt = Math.max(...times);
                        resolve({
                            fps: Math.round(1000 / avg),
                            avgFrameMs: parseFloat(avg.toFixed(1)),
                            minFps: Math.round(1000 / maxDt),
                        });
                    } else {
                        requestAnimationFrame(tick);
                    }
                }
                requestAnimationFrame(tick);
            });
        });

        console.log(`FPS: ${fpsResult.fps}, Avg frame: ${fpsResult.avgFrameMs}ms, Min FPS: ${fpsResult.minFps}`);

        // Assert minimum acceptable performance
        expect(fpsResult.fps).toBeGreaterThan(30);
        expect(fpsResult.avgFrameMs).toBeLessThan(33);
    });

    test('debug overlay shows stats', async ({ page }) => {
        await page.goto('/?debug=1');
        await page.waitForLoadState('networkidle');

        // Start training match to get canvas active
        const trainingBtn = page.locator('button:has-text("TRAINING"), button:has-text("Training"), button:has-text("SOLO")');
        await trainingBtn.first().click({ timeout: 10_000 });

        await page.waitForTimeout(2000);
        const readyBtn = page.locator('button:has-text("READY"), button:has-text("Ready")');
        if (await readyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await readyBtn.click();
        }

        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(3000);

        // Take screenshot with debug overlay visible
        await page.screenshot({ path: 'tests/screenshots/debug-overlay.png' });

        // Verify the debug overlay is rendering by checking canvas pixel data
        // The overlay is at bottom-left with dark background
        const hasOverlay = await page.evaluate(() => {
            const canvas = document.querySelector('canvas');
            if (!canvas) return false;
            const ctx = canvas.getContext('2d');
            if (!ctx) return false;
            // Sample a pixel at the debug overlay position (bottom-left area)
            const dpr = window.devicePixelRatio || 1;
            const x = 20 * dpr;
            const y = (canvas.height / dpr - 50) * dpr;
            const pixel = ctx.getImageData(x, y, 1, 1).data;
            // The overlay background is rgba(10, 10, 18, 0.85)
            // Check that the pixel is dark (not the sky gradient which is lighter)
            return pixel[0] < 30 && pixel[1] < 30 && pixel[2] < 40 && pixel[3] > 200;
        });

        expect(hasOverlay).toBe(true);
    });
});
