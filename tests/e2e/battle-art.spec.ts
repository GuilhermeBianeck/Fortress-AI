import { test, expect } from '@playwright/test';

test.use({ deviceScaleFactor: 3 });

test('illustrated battlefield is sharp, layered and usable through rotation and combat', async ({ page }, testInfo) => {
    const errors: string[] = [], failures: string[] = [], placements: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && /assets|sprites/.test(r.url())) failures.push(r.url()); });
    page.on('websocket', socket => socket.on('framesent', frame => { if (String(frame.payload).includes('["spawn",')) placements.push(String(frame.payload)); }));
    await page.addInitScript(() => {
        const seen = new Set<string>();
        Object.assign(window, { battleArtDrawn: seen });
        const draw = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function (...args: Parameters<typeof draw>) {
            if (args[0] instanceof HTMLImageElement) {
                const match = args[0].src.match(/\/(sky|valley|cloud|grass|hud)-/);
                if (match) seen.add(match[1]);
            }
            return draw.apply(this, args);
        };
    });
    await page.goto('/');
    await page.getByRole('button', { name: /BATTLE/ }).click();
    await page.getByRole('button', { name: /READY FOR BATTLE/ }).click();
    await expect(page.locator('.battle-canvas')).toBeVisible();
    await page.waitForFunction(() => typeof (window as Window & { render_game_to_text?: unknown }).render_game_to_text === 'function');
    const read = () => page.evaluate(() => JSON.parse((window as Window & { render_game_to_text: () => string }).render_game_to_text()));
    await expect.poll(async () => (await read()).battleArtLoaded).toBe(8);
    const initialCanvas = (await page.locator('.battle-canvas').boundingBox())!;
    await page.mouse.click(initialCanvas.x + 50, initialCanvas.y + 100);
    expect(placements).toEqual([]);
    await expect.poll(() => page.evaluate(() => [...(window as Window & { battleArtDrawn: Set<string> }).battleArtDrawn].sort())).toEqual(['cloud', 'grass', 'hud', 'sky', 'valley']);
    for (const [width, height] of [[1440, 900], [390, 844], [768, 1024], [844, 390], [320, 568]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(180);
        const canvas = (await page.locator('.battle-canvas').boundingBox())!;
        expect(canvas.height).toBeGreaterThan(180);
        const header = (await page.locator('.game-phase-row').boundingBox())!;
        expect(header.y).toBeLessThanOrEqual(canvas.y + 1);
        expect(header.y + header.height).toBeLessThan(canvas.y + canvas.height / 2);
        const dpr = await page.locator('.battle-canvas').evaluate(canvas => {
            const c = canvas as HTMLCanvasElement;
            return { backing: c.width, css: c.getBoundingClientRect().width, device: devicePixelRatio };
        });
        const expected = Math.min(3, dpr.device, Math.max(1, Math.sqrt(4_194_304 / (canvas.width * canvas.height))));
        expect(Math.abs(dpr.backing / dpr.css - expected)).toBeLessThan(0.01);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `output/battle-v5/${testInfo.project.name}-build-${width}x${height}.png`, scale: 'css' });
    }
    await page.getByRole('button', { name: 'Done building, ready for battle' }).click();
    await expect(page.getByRole('button', { name: 'Fire', exact: true })).toBeEnabled({ timeout: 15000 });
    for (const [width, height] of [[1440, 900], [390, 844], [844, 390], [320, 568]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(150);
        const fire = (await page.locator('.battle-fire').boundingBox())!;
        expect(fire.height).toBeGreaterThanOrEqual(44);
        expect(fire.y + fire.height).toBeLessThanOrEqual(height + 1);
        expect(fire.x + fire.width).toBeLessThanOrEqual(width + 1);
        expect(await page.locator('.battle-fire').evaluate(element => getComputedStyle(element, '::before').borderImageSource)).toContain('fire-');
        await page.screenshot({ path: `output/battle-v5/${testInfo.project.name}-combat-${width}x${height}.png`, scale: 'css' });
    }
    await page.getByRole('button', { name: 'Fire', exact: true }).click();
    await expect(page.locator('.battle-fire')).toBeDisabled();
    await expect(page.getByText('SHOT IN FLIGHT', { exact: true })).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(async () => (await read()).rendering.reducedMotion).toBe(true);
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
});
