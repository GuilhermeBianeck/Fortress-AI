import { test, expect } from '@playwright/test';

test('royal layers fit the reference stage and freeze with reduced motion', async ({ page }, testInfo) => {
    const failures: string[] = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('response', response => {
        if (response.status() >= 400 && /assets|sprites|audio/.test(response.url())) failures.push(response.url());
    });
    await page.goto('/');
    await expect(page.locator('.royal-wordmark img')).toBeVisible();
    for (const [width, height] of [[1440, 900], [1280, 720], [390, 844], [768, 1024], [844, 390], [320, 568]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(200);
        await expect.poll(() => page.locator('.menu-viewport img').evaluateAll(images => images.every(image => {
            const img = image as HTMLImageElement;
            return img.complete && img.naturalWidth > 0;
        }))).toBe(true);
        const fields = await page.locator('.menu-field input').all();
        for (const field of fields) {
            const box = (await field.boundingBox())!;
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width);
        }
        const battle = (await page.getByRole('button', { name: /BATTLE/ }).boundingBox())!;
        expect(battle.y + battle.height).toBeLessThanOrEqual(height);
        expect(battle.height).toBeGreaterThanOrEqual(44);
        const controls = await page.locator('.menu-controls > *').evaluateAll(elements => elements.map(element => {
            const { top, bottom } = element.getBoundingClientRect();
            return { top, bottom };
        }));
        for (let i = 1; i < controls.length; i++) expect(controls[i].top).toBeGreaterThanOrEqual(controls[i - 1].bottom);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `output/royal-menu-v4/${testInfo.project.name}-${width}x${height}.png` });
    }
    expect(await page.locator('.royal-corner').count()).toBe(2);
    expect(await page.locator('.royal-torch--flame img').first().evaluate(element => getComputedStyle(element).animationName)).toBe('royal-flame-dance');
    expect(await page.locator('.royal-torch--bowl img').first().evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.locator('.menu-viewport *').evaluateAll(elements => elements.every(element => getComputedStyle(element).animationName === 'none'))).toBe(true);
    expect(failures).toEqual([]);
});
