import { Page, expect } from '@playwright/test';

/**
 * Navigate to lobby, click Single Player, click Ready, wait for canvas.
 * Returns when the build phase canvas is visible.
 */
export async function startSinglePlayerMatch(page: Page): Promise<void> {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click Single Player
    const singlePlayerBtn = page.locator('button').filter({ hasText: /single player/i });
    await singlePlayerBtn.click({ timeout: 10_000 });
    await page.waitForTimeout(1500);

    // Click Ready
    const readyBtn = page.locator('button').filter({ hasText: /ready/i });
    if (await readyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await readyBtn.click();
    }

    // Wait for canvas to be visible (match started)
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2000); // Let rendering stabilize
}

/**
 * Wait for a specific phase text to appear in the DOM.
 * PhaseOverlay renders phase indicators as text in the DOM.
 */
export async function waitForPhase(page: Page, phasePattern: RegExp, timeout = 30_000): Promise<void> {
    await page.locator(`text=${phasePattern}`).first().waitFor({ state: 'visible', timeout });
}

/**
 * Measure FPS over a given duration using requestAnimationFrame.
 * Returns average FPS, min FPS, max frame time.
 */
export async function measureFps(page: Page, frames = 120): Promise<{ fps: number; avgFrameMs: number; maxFrameMs: number }> {
    return page.evaluate((n) => {
        return new Promise<{ fps: number; avgFrameMs: number; maxFrameMs: number }>((resolve) => {
            const times: number[] = [];
            let last = performance.now();
            let count = 0;
            function tick(now: number) {
                times.push(now - last);
                last = now;
                if (++count >= n) {
                    const avg = times.reduce((a, b) => a + b) / times.length;
                    const max = Math.max(...times);
                    resolve({
                        fps: Math.round(1000 / avg),
                        avgFrameMs: parseFloat(avg.toFixed(1)),
                        maxFrameMs: parseFloat(max.toFixed(1)),
                    });
                } else {
                    requestAnimationFrame(tick);
                }
            }
            requestAnimationFrame(tick);
        });
    }, frames);
}

/**
 * Measure JS heap size (Chrome only). Returns MB or null.
 */
export async function measureMemory(page: Page): Promise<number | null> {
    return page.evaluate(() => {
        const perf = performance as any;
        return perf.memory ? perf.memory.usedJSHeapSize / (1024 * 1024) : null;
    });
}

/**
 * Skip build phase by clicking the DONE button if visible.
 */
export async function skipBuildPhase(page: Page): Promise<void> {
    const doneBtn = page.locator('button').filter({ hasText: /done/i });
    if (await doneBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await doneBtn.click();
    }
}
