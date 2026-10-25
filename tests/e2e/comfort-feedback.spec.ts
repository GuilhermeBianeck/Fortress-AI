import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { reconstructGameState } from '../../src/hooks/gameStateSnapshot';
import type { BodyState, CompactGameState, GameState } from '../../src/types';

const read = (page: Page) => page.evaluate(() => JSON.parse((window as Window & { render_game_to_text: () => string }).render_game_to_text()));
async function start(page: Page) {
    await page.goto('/'); await page.getByRole('button', { name: /BATTLE/ }).click();
    await page.getByRole('button', { name: /READY FOR BATTLE/ }).click();
    await expect(page.locator('.battle-canvas')).toBeVisible();
    await expect.poll(async () => (await read(page)).livingKingsLoaded).toBe(12);
}

test('recovery notice clears the menu header and leaves Battle reachable at every size', async ({ page, context }, testInfo) => {
    await start(page);
    await context.setOffline(true);
    await expect(page.getByRole('alert').filter({ hasText: /Connection lost/ })).toBeVisible({ timeout: 18000 });
    await expect(page.locator('main')).toHaveAttribute('inert', '');
    await context.setOffline(false);
    const notice = page.locator('.connection-notice');
    await expect(notice).toHaveText(/Connection restored/, { timeout: 10000 });
    await expect(page.locator('.battle-canvas')).toHaveCount(0);
    for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 800]]) {
        await page.setViewportSize({ width, height }); await page.waitForTimeout(200);
        const header = (await page.locator('.menu-header').boundingBox())!;
        const message = (await notice.boundingBox())!;
        const battle = (await page.getByRole('button', { name: /BATTLE/ }).boundingBox())!;
        expect(message.y).toBeGreaterThanOrEqual(header.y + header.height);
        expect(message.x).toBeGreaterThanOrEqual(0);
        expect(message.x + message.width).toBeLessThanOrEqual(width);
        expect(battle.y).toBeGreaterThanOrEqual(message.y + message.height);
        expect(battle.y + battle.height).toBeLessThanOrEqual(height + 1);
        await page.screenshot({ path: `output/playwright/v11-recovery-${testInfo.project.name}-${width}x${height}.png` });
    }
});

test('saved comfort settings fit phones, trap focus and keep Manual camera still through real turns', async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    // Keep this a private solo game, but render the three-button multiplayer header at320px too.
    await page.routeWebSocket('**/socket.io/**', socket => {
        const server = socket.connectToServer();
        server.onMessage(message => {
            if (message.toString().startsWith('42')) {
                const [event, data] = JSON.parse(message.toString().slice(2));
                if (event === 'room_joined') {
                    data.players = data.players.map((player: { name: string }) => ({ ...player, name: player.name === 'Training Bot' ? 'Rival QA' : player.name }));
                    socket.send(`42${JSON.stringify([event, data])}`); return;
                }
            }
            socket.send(message);
        });
    });
    await start(page);
    const settings = page.getByRole('button', { name: 'Game settings', exact: true });
    await settings.click(); const dialog = page.getByRole('dialog', { name: 'Game settings' });
    await expect(dialog).toBeVisible();
    await page.getByLabel('Camera', { exact: true }).selectOption('manual');
    await page.getByLabel('Motion', { exact: true }).selectOption('reduced');
    await page.getByLabel('Hit labels', { exact: true }).uncheck();
    for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 800]]) {
        await page.setViewportSize({ width, height });
        const box = (await dialog.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y + box.height).toBeLessThanOrEqual(height);
        const banner = (await page.locator('.battle-phase-banner').boundingBox())!, actions = (await page.locator('.game-phase-actions').boundingBox())!;
        expect(banner.x + banner.width).toBeLessThanOrEqual(actions.x);
        expect(actions.x + actions.width).toBeLessThanOrEqual(width);
    }
    await page.setViewportSize(testInfo.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 800 });
    await page.screenshot({ path: `output/comfort-v10/${testInfo.project.name}-settings.png` });
    for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(settings).toBeFocused();
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('f');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('game-container'))).toBe(true);
    await settings.click(); await expect(dialog).toBeVisible();
    await page.getByRole('button', { name: 'Close game settings' }).click();
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForTimeout(100);
    await expect.poll(async () => (await read(page)).cameraMotion.mode).toBe('manual');
    expect((await read(page)).rendering.reducedMotion).toBe(true);
    const before = await read(page), initial = before.camera + before.viewport.worldWidth / 2;
    await page.getByRole('button', { name: 'Done building, ready for battle' }).click();
    await expect(page.getByRole('button', { name: 'Fire', exact: true })).toBeEnabled({ timeout: 15000 });
    const combat = await read(page);
    expect(Math.abs(combat.camera + combat.viewport.worldWidth / 2 - initial)).toBeLessThan(1);
    await page.locator('#cannon-power').fill('70'); await page.getByRole('button', { name: 'Fire', exact: true }).click();
    await expect.poll(async () => (await read(page)).turn, { timeout: 12000 }).toBe('right');
    const after = await read(page);
    expect(Math.abs(after.camera + after.viewport.worldWidth / 2 - initial)).toBeLessThan(1);
    await settings.click(); await page.getByLabel('Camera', { exact: true }).selectOption('turn');
    await page.getByRole('button', { name: 'Close game settings' }).click();
    await expect.poll(async () => (await read(page)).cameraMotion.mode).toBe('turn');
    await page.reload(); await start(page); await settings.click();
    await expect(page.getByLabel('Camera', { exact: true })).toHaveValue('turn');
    await expect(page.getByLabel('Motion', { exact: true })).toHaveValue('reduced');
    await expect(page.getByLabel('Hit labels', { exact: true })).not.toBeChecked();
    expect(errors).toEqual([]);
});

test('a batched WebSocket stream adapts its presentation buffer during real gameplay', async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.routeWebSocket('**/socket.io/**', socket => {
        const server = socket.connectToServer();
        let queued: (string | Buffer)[] = [], timer: ReturnType<typeof setTimeout> | undefined;
        server.onMessage(message => {
            if (message.toString().startsWith('42') && JSON.parse(message.toString().slice(2))[0] === 'gameState') {
                queued.push(message);
                timer ??= setTimeout(() => { for (const packet of queued) socket.send(packet); queued = []; timer = undefined; }, 250);
            } else socket.send(message);
        });
        socket.onClose(() => { clearTimeout(timer); queued = []; server.close(); });
    });
    await start(page);
    await expect.poll(async () => (await read(page)).presentation.delayMs).toBeGreaterThan(130);
    expect((await read(page)).presentation.delayMs).toBeLessThanOrEqual(240);
    await page.getByRole('button', { name: 'Done building, ready for battle' }).click();
    await expect(page.getByRole('button', { name: 'Fire', exact: true })).toBeEnabled({ timeout: 15000 });
    await page.locator('#cannon-power').fill('70'); await page.getByRole('button', { name: 'Fire', exact: true }).click();
    await expect.poll(async () => (await read(page)).presentation.projectiles.length, { intervals: [10, 20] }).toBeGreaterThan(0);
    const samples = await page.evaluate(async () => {
        const values: { time: number; presentation: number; delay: number }[] = [];
        for (let i = 0; i < 70; i++) {
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            const state = JSON.parse((window as Window & { render_game_to_text: () => string }).render_game_to_text());
            values.push({ time: performance.now(), presentation: state.presentation.timestamp, delay: state.presentation.delayMs });
        }
        return values;
    });
    for (let i = 1; i < samples.length; i++) {
        expect(samples[i].presentation).toBeGreaterThanOrEqual(samples[i - 1].presentation);
        expect(samples[i].delay).toBeLessThanOrEqual(240);
    }
    await testInfo.attach('batched-connection', { body: JSON.stringify(samples), contentType: 'application/json' });
    await page.screenshot({ path: `output/comfort-v10/${testInfo.project.name}-batched.png` });
    expect(errors).toEqual([]);
});

test('canvas draws honest, distinct hit labels and queues timestamped cues behind the displayed timeline', async ({ page }, testInfo) => {
    let wire: WebSocketRoute | undefined, freeze = false;
    let cache = new Map<number, BodyState>(), latest: GameState | undefined;
    await page.addInitScript(() => {
        const texts: string[] = []; Object.assign(window, { feedbackTexts: texts });
        const fill = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
            if (/HIT|BROKEN|SHATTERED|CRUSH|DEFEATED|^-\d/.test(text)) { texts.push(text); if (texts.length > 200) texts.shift(); }
            if (maxWidth === undefined) fill.call(this, text, x, y); else fill.call(this, text, x, y, maxWidth);
        };
    });
    await page.routeWebSocket('**/socket.io/**', socket => {
        wire = socket; const server = socket.connectToServer();
        server.onMessage(message => {
            if (message.toString().startsWith('42')) {
                const [event, data] = JSON.parse(message.toString().slice(2));
                if (event === 'gameState') { const reconstructed = reconstructGameState(cache, data as CompactGameState); cache = reconstructed.bodyCache; latest = reconstructed.gameState; }
                if (freeze) return;
            }
            socket.send(message);
        });
    });
    await start(page); freeze = true;
    const frame = await read(page), x = frame.camera + frame.viewport.worldWidth * .5;
    const timestamp = Date.now() + 1000;
    wire!.send(`42${JSON.stringify(['king_damage', { side: 'left', hp: 35, maxHp: 100, damage: 65, source: 'projectile', position: { x, y: 420 }, timestamp }])}`);
    await page.waitForTimeout(250);
    const texts = () => page.evaluate(() => (window as Window & { feedbackTexts: string[] }).feedbackTexts);
    expect(await texts()).not.toContain('HEAVY HIT');
    const state = (t: number) => wire!.send(`42${JSON.stringify(['gameState', { f: 1, t, n: latest!.bodies, u: [], r: [], k: { l: { ...latest!.kings.left, hp: 35 }, r: latest!.kings.right } }])}`);
    state(timestamp); state(timestamp + 50);
    await expect.poll(texts, { intervals: [10, 20] }).toContain('HEAVY HIT'); await expect.poll(texts, { intervals: [10, 20] }).toContain('-65');
    await page.screenshot({ path: `output/comfort-v10/${testInfo.project.name}-heavy-hit.png` });
    await page.waitForTimeout(1000);
    for (const [i, material, destroyed, caption] of [[1, 'steel', false, 'ARMOR HIT'], [2, 'ice', true, 'SHATTERED']] as const) {
        wire!.send(`42${JSON.stringify(['projectile_impact', { position: { x, y: 420 }, target: 'block', targetId: i, material, destroyed, damage: 15 }])}`);
        await expect.poll(texts).toContain(caption);
        await page.screenshot({ path: `output/comfort-v10/${testInfo.project.name}-${material}-hit.png` });
        await page.waitForTimeout(1000);
    }
    await page.getByRole('button', { name: 'Game settings', exact: true }).click();
    await page.getByLabel('Hit labels', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Close game settings' }).click();
    await page.evaluate(() => { (window as Window & { feedbackTexts: string[] }).feedbackTexts.length = 0; });
    wire!.send(`42${JSON.stringify(['king_damage', { side: 'left', hp: 20, maxHp: 100, damage: 15, source: 'projectile', position: { x, y: 420 } }])}`);
    await expect.poll(texts, { intervals: [10, 20] }).toContain('-15');
    expect(await texts()).not.toContain('LIGHT HIT');
});
