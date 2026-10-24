import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { io } from 'socket.io-client';
import { randomUUID } from 'node:crypto';

async function menuFits(page: Page) {
    const viewport = page.viewportSize()!;
    const battle = await page.getByRole('button', { name: /BATTLE/ }).boundingBox();
    expect(battle).not.toBeNull();
    expect(battle!.y).toBeGreaterThanOrEqual(0);
    expect(battle!.y + battle!.height).toBeLessThanOrEqual(viewport.height);
    expect(battle!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.cartoon-lobby img').evaluateAll(images => images.every(image => {
        const img = image as HTMLImageElement;
        return img.complete && img.naturalWidth > 0;
    }))).toBe(true);
    const name = await page.getByRole('textbox', { name: 'Player name' }).boundingBox();
    expect(name!.y + name!.height).toBeLessThan(battle!.y);
}

test('cartoon menu remains usable across sizes, reduced motion and expanded help', async ({ page }, testInfo) => {
    const failures: string[] = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && /assets|sprites/.test(response.url())) failures.push(response.url()); });
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Player name' }).fill('Captain with a long name');
    await page.waitForTimeout(1300);
    await expect(page.getByRole('textbox', { name: 'Player name' })).toBeVisible();
    for (const [width, height] of [[1280, 720], [390, 844], [768, 1024], [844, 390], [320, 568]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(250);
        await menuFits(page);
        await page.screenshot({ path: `output/cartoon-v3/${testInfo.project.name}-menu-${width}x${height}.png` });
    }
    await page.getByRole('button', { name: /How to Play/i }).click();
    await expect(page.locator('#how-to-play-content')).toBeVisible();
    await page.getByRole('button', { name: /How to Play/i }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await menuFits(page);
    expect(await page.locator('.cartoon-menu-scene [class]').evaluateAll(elements => elements.every(element => {
        const style = getComputedStyle(element);
        return style.animationName === 'none' || style.animationDuration.split(',').every(duration => parseFloat(duration) <= 0.001);
    }))).toBe(true);
    await page.getByRole('radio', { name: 'PvP', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'PvP', exact: true })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: /BATTLE/ }).click();
    await expect(page.getByRole('heading', { name: 'Seeking Challenger...' })).toBeVisible();
    await page.screenshot({ path: `output/cartoon-v3/${testInfo.project.name}-queue.png` });
    await page.getByRole('button', { name: /Retreat/i }).click();
    await expect(page.getByRole('textbox', { name: 'Player name' })).toHaveValue('Captain with a long name'.slice(0, 20));
    expect(failures).toEqual([]);
});

test('registered king poses are actually drawn for damage and both result outcomes', async ({ page }, testInfo) => {
    let wire: WebSocketRoute | undefined;
    await page.routeWebSocket('**/socket.io/**', socket => {
        wire = socket;
        socket.connectToServer();
    });
    await page.addInitScript(() => {
        localStorage.setItem('fortress_has_played', '1');
        const frames: string[] = [];
        Object.assign(window, { drawnKingFrames: frames });
        const original = CanvasRenderingContext2D.prototype.drawImage;
        Object.defineProperty(CanvasRenderingContext2D.prototype, 'drawImage', {
            value: function (this: CanvasRenderingContext2D, ...args: Parameters<typeof original>) {
                const source = args[0];
                if (source instanceof HTMLImageElement && /(king|rival)_(idle|hit|victory|defeat)/.test(source.src)) {
                    if (frames.at(-1) !== source.src) frames.push(source.src);
                }
                return original.apply(this, args);
            },
        });
    });
    await page.goto('/');
    await page.getByRole('button', { name: /BATTLE/ }).click();
    await expect(page.getByRole('img', { name: 'Victorious king' })).toHaveCount(0);
    for (const [width, height] of [[320, 568], [844, 390]]) {
        await page.setViewportSize({ width, height });
        const ready = await page.getByRole('button', { name: /READY FOR BATTLE/ }).boundingBox();
        expect(ready!.y + ready!.height).toBeLessThanOrEqual(height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: testInfo.project.name === 'mobile' ? 390 : 1280, height: testInfo.project.name === 'mobile' ? 844 : 720 });
    const contenders = page.locator('.menu-contender img');
    await expect(contenders.first()).toHaveAttribute('src', /king/);
    await expect(contenders.last()).toHaveAttribute('src', /rival_idle/);
    await page.screenshot({ path: `output/cartoon-v3/${testInfo.project.name}-ready.png` });
    await page.getByRole('button', { name: /READY FOR BATTLE/ }).click();
    await expect(page.locator('.battle-canvas')).toBeVisible();
    const read = () => page.evaluate(() => JSON.parse((window as Window & { render_game_to_text: () => string }).render_game_to_text()));
    await expect.poll(async () => (await read()).reactionsLoaded).toBe(7);
    expect((await read()).kingCharacters).toEqual({ left: 'ember', right: 'ivory' });
    await expect.poll(async () => (await read()).bodies.filter((body: { kind: string }) => body.kind === 'king').length).toBe(2);
    // Display fixtures enter through the network boundary, never a production cheat hook.
    wire!.send(`42${JSON.stringify(['king_damage', { side: 'left', hp: 90, maxHp: 100, damage: 10, source: 'projectile' }])}`);
    await expect.poll(async () => (await read()).kingPoses.left, { intervals: [10, 20, 40] }).toBe('hit');
    await expect.poll(() => page.evaluate(() => (window as Window & { drawnKingFrames: string[] }).drawnKingFrames.some(src => src.includes('king_hit'))), { intervals: [10, 20, 40] }).toBe(true);
    await page.screenshot({ path: `output/cartoon-v3/${testInfo.project.name}-hit.png` });
    await expect.poll(async () => (await read()).kingPoses.left).toBe('idle');
    for (let step = 0; step < 12; step++) {
        const frame = await read();
        if (frame.kings.right.x > frame.camera + 40 && frame.kings.right.x < frame.camera + frame.viewport.worldWidth - 40) break;
        await page.getByRole('button', { name: 'Pan right', exact: true }).click();
        await page.waitForTimeout(180);
    }
    await expect.poll(() => page.evaluate(() => (window as Window & { drawnKingFrames: string[] }).drawnKingFrames.some(src => src.includes('rival_idle')))).toBe(true);
    wire!.send(`42${JSON.stringify(['king_damage', { side: 'right', hp: 90, maxHp: 100, damage: 10, source: 'projectile' }])}`);
    await expect.poll(async () => (await read()).kingPoses.right, { intervals: [10, 20, 40] }).toBe('hit');
    await expect.poll(() => page.evaluate(() => (window as Window & { drawnKingFrames: string[] }).drawnKingFrames.some(src => src.includes('rival_hit'))), { intervals: [10, 20, 40] }).toBe(true);
    await page.screenshot({ path: `output/cartoon-v3/${testInfo.project.name}-rival-hit.png` });
    for (const winner of ['left', 'right']) {
        wire!.send(`42${JSON.stringify(['match_result', { winner, reason: 'king_destroyed', kings: (await read()).kings }])}`);
        const pose = winner === 'left' ? 'victory' : 'defeat';
        await expect(page.locator(`[data-king-pose="${pose}"]`)).toBeVisible();
        await expect.poll(async () => (await read()).kingPoses.left).toBe(pose);
        await expect(page.locator(`[data-king-pose="${pose}"]`)).toHaveAttribute('data-king-character', 'ember');
        const rivalPose = winner === 'right' ? 'victory' : 'defeat';
        await expect.poll(() => page.evaluate(value => (window as Window & { drawnKingFrames: string[] }).drawnKingFrames.some(src => src.includes(`rival_${value}`)), rivalPose)).toBe(true);
        await page.waitForTimeout(900);
        await page.screenshot({ path: `output/cartoon-v3/${testInfo.project.name}-${pose}.png` });
    }
    await page.getByRole('button', { name: 'New Game' }).click();
    await expect(page.getByRole('textbox', { name: 'Player name' })).toBeVisible();
});

test('real opponent disconnect shows the winning king and returns to the menu', async ({ page }, testInfo) => {
    const host = io('http://127.0.0.1:3001', { transports: ['websocket'], auth: { uuid: randomUUID() } });
    try {
        await new Promise<void>(resolve => host.once('connect', resolve));
        const room = await new Promise<string>(resolve => {
            host.once('room_created', data => resolve(data.roomId));
            host.emit('create_room', { name: 'Portrait QA', mode: 'pvp' });
        });
        host.emit('player_ready');
        await page.goto(`/?room=${room}`);
        const contenders = page.locator('.menu-contender img');
        await expect(contenders.first()).toHaveAttribute('src', /rival_idle/);
        await expect(contenders.first()).toHaveCSS('transform', 'none');
        await expect(contenders.last()).toHaveAttribute('src', /king/);
        await expect(contenders.last()).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
        await page.getByRole('button', { name: /READY FOR BATTLE/ }).click();
        await expect(page.locator('.battle-canvas')).toBeVisible();
        host.disconnect();
        await expect(page.getByRole('img', { name: 'Victorious king' })).toBeVisible();
        await expect(page.getByRole('img', { name: 'Victorious king' })).toHaveAttribute('src', /rival_victory/);
        await expect(page.getByRole('img', { name: 'Victorious king' })).toHaveAttribute('data-king-character', 'ivory');
        await page.waitForTimeout(900);
        await page.screenshot({ path: `output/cartoon-v3/${testInfo.project.name}-real-victory.png` });
        await page.getByRole('button', { name: 'New Game' }).click();
        await expect(page.getByRole('textbox', { name: 'Player name' })).toBeVisible();
    } finally { host.disconnect(); }
});
