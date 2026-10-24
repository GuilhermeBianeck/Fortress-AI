import { test, expect } from '@playwright/test';

test('living kings draw independent parts and shots advance smoothly between server packets', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        const parts = new Set<string>();
        Object.assign(window, { livingPartsDrawn: parts });
        const draw = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function (...args: Parameters<typeof draw>) {
            if (args[0] instanceof HTMLImageElement) {
                const name = args[0].src.match(/\/(ember|ivory)_(body|chest|head_open|head_closed|arm|cape)-/);
                if (name) parts.add(`${name[1]}_${name[2]}`);
            }
            return draw.apply(this, args);
        };
    });
    await page.goto('/');
    await page.getByRole('button', { name: /BATTLE/ }).click();
    await page.getByRole('button', { name: /READY FOR BATTLE/ }).click();
    await expect(page.locator('.battle-canvas')).toBeVisible();
    const read = () => page.evaluate(() => JSON.parse((window as Window & { render_game_to_text: () => string }).render_game_to_text()));
    await expect.poll(async () => (await read()).livingKingsLoaded).toBe(12);
    // Both independent open and closed eye art must really reach the canvas.
    await expect.poll(() => page.evaluate(() => [...(window as Window & { livingPartsDrawn: Set<string> }).livingPartsDrawn]),
        { timeout: 8000 }).toEqual(expect.arrayContaining(['ember_body', 'ember_chest', 'ember_arm', 'ember_cape', 'ember_head_open', 'ember_head_closed']));
    for (let step = 0; step < 16; step++) {
        const state = await read();
        if (state.kings.right.x > state.camera + 40 && state.kings.right.x < state.camera + state.viewport.worldWidth - 40) break;
        await page.getByRole('button', { name: 'Pan right', exact: true }).click();
        await page.waitForTimeout(150);
    }
    await expect.poll(() => page.evaluate(() => [...(window as Window & { livingPartsDrawn: Set<string> }).livingPartsDrawn]),
        { timeout: 8000 }).toEqual(expect.arrayContaining(['ivory_body', 'ivory_chest', 'ivory_arm', 'ivory_cape', 'ivory_head_open', 'ivory_head_closed']));
    await page.screenshot({ path: `output/playtest-v6/${testInfo.project.name}-ivory-build.png` });
    await page.getByRole('button', { name: 'Recenter battlefield', exact: true }).click();
    const a = (await read()).livingKingStates.left;
    await page.waitForTimeout(450);
    expect((await read()).livingKingStates.left).not.toEqual(a);
    await page.screenshot({ path: `output/playtest-v6/${testInfo.project.name}-living-build.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(async () => (await read()).rendering.reducedMotion).toBe(true);
    const still = (await read()).livingKingStates;
    await page.waitForTimeout(150);
    expect((await read()).livingKingStates).toEqual(still);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Done building, ready for battle' }).click();
    await expect(page.getByRole('button', { name: 'Fire', exact: true })).toBeEnabled({ timeout: 15000 });
    // A low-power default shot may hit nearby ground before a useful sample window.
    await page.locator('#cannon-power').fill('70');
    await page.getByRole('button', { name: 'Fire', exact: true }).click();
    await expect.poll(async () => (await read()).presentation.projectiles.length, { intervals: [10, 20] }).toBeGreaterThan(0);
    const samples = await page.evaluate(async () => {
        const positions: { x: number; y: number; t: number; serverT: number }[] = [];
        for (let i = 0; i < 25; i++) {
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            const state = JSON.parse((window as Window & { render_game_to_text: () => string }).render_game_to_text());
            const ball = state.presentation.projectiles[0];
            if (ball) positions.push({ x: ball.x, y: ball.y, t: performance.now(), serverT: state.presentation.timestamp });
        }
        return positions;
    });
    expect(samples.length).toBeGreaterThan(12);
    const moving = samples.slice(1).filter((point, i) => Math.hypot(point.x - samples[i].x, point.y - samples[i].y) > 0.01);
    expect(moving.length / (samples.length - 1)).toBeGreaterThan(0.85);
    const advancing = samples.slice(1).filter((point, i) => point.serverT > samples[i].serverT);
    expect(advancing.length / (samples.length - 1)).toBeGreaterThan(0.85);
    await testInfo.attach('presented-shot-samples', { body: JSON.stringify({ samples, moving: moving.length, advancing: advancing.length }), contentType: 'application/json' });
    await page.screenshot({ path: `output/playtest-v6/${testInfo.project.name}-smooth-flight.png` });
    expect(errors).toEqual([]);
});
