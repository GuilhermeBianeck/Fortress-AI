import { test, expect, type WebSocketRoute } from '@playwright/test';

test('material feedback is distinct and bounded, reduced motion clears it, and accepted shots emit at the muzzle', async ({ page }, testInfo) => {
    let wire: WebSocketRoute | undefined;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.routeWebSocket('**/socket.io/**', socket => {
        wire = socket;
        socket.connectToServer();
    });
    await page.goto('/');
    await page.getByRole('button', { name: /BATTLE/ }).click();
    await page.getByRole('button', { name: /READY FOR BATTLE/ }).click();
    await expect(page.locator('.battle-canvas')).toBeVisible();
    const read = () => page.evaluate(() => JSON.parse((window as Window & { render_game_to_text: () => string }).render_game_to_text()));
    await expect.poll(async () => (await read()).reactionsLoaded).toBe(7);
    const frame = await read();
    const materials = ['wood', 'stone', 'ice', 'rubber', 'steel'];
    const kinds = ['splinter', 'chip', 'shard', 'fleck', 'spark'];
    // Rendering fixtures exercise real handlers; no blocks are removed from the server.
    const burst = (material: string, index: number) => wire!.send(`42${JSON.stringify(['block_destroyed', {
        bodyId: 99900 + index, material, velocity: { x: 3, y: -2 },
        position: { x: frame.camera + (0.18 + index * 0.15) * frame.viewport.worldWidth, y: 390 },
    }])}`);
    for (let index = 0; index < materials.length; index++) burst(materials[index], index);
    await expect.poll(async () => (await read()).particles.byMaterial.steel, { intervals: [10, 20] }).toBeGreaterThan(0);
    const counts = (await read()).particles;
    for (const material of materials) expect(counts.byMaterial[material]).toBeGreaterThan(0);
    for (const kind of kinds) expect(counts.byKind[kind]).toBeGreaterThan(0);
    expect(counts.total).toBeLessThanOrEqual(300);
    await page.screenshot({ path: `output/cartoon-v3/${testInfo.project.name}-materials.png` });
    for (let index = 0; index < 50; index++) burst(materials[index % materials.length], index % materials.length);
    expect((await read()).particles.total).toBeLessThanOrEqual(300);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(async () => (await read()).particles.total).toBe(0);
    burst('wood', 0);
    await page.waitForTimeout(80);
    expect((await read()).particles.total).toBe(0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Done building, ready for battle' }).click();
    await expect(page.getByRole('button', { name: 'Fire', exact: true })).toBeEnabled({ timeout: 15000 });
    expect((await read()).shot).toBeNull();
    await page.getByRole('button', { name: 'Fire', exact: true }).click();
    await expect.poll(async () => (await read()).shot?.side, { intervals: [10, 20, 40] }).toBe('left');
    const fired = await read();
    expect(fired.shot.muzzle.x).toBeGreaterThan(50);
    expect(fired.shot.age).toBeLessThan(500);
    expect(fired.particles.byKind.smoke).toBeGreaterThan(0);
    expect(fired.particles.total).toBeLessThanOrEqual(300);
    await page.screenshot({ path: `output/cartoon-v3/${testInfo.project.name}-muzzle.png` });
    await expect(page.locator('.battle-fire')).toBeDisabled();
    expect(errors).toEqual([]);
});
