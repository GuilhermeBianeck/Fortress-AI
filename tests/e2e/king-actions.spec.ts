import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { reconstructGameState } from '../../src/hooks/gameStateSnapshot';
import type { BodyState, CompactGameState, GameState, Side } from '../../src/types';

const read = (page: Page) => page.evaluate(() => JSON.parse((window as Window & { render_game_to_text: () => string }).render_game_to_text()));
async function frameKing(page: Page, side: Side) {
    for (let i = 0; i < 18; i++) {
        const state = await read(page);
        const x = state.kings[side].x;
        if (x > state.camera + 50 && x < state.camera + state.viewport.worldWidth - 50) return;
        const direction = x < state.camera + state.viewport.worldWidth / 2 ? 'left' : 'right';
        await page.getByRole('button', { name: `Pan ${direction}`, exact: true }).click();
        await page.waitForTimeout(150);
    }
    throw new Error(`Could not frame ${side} king`);
}

test('kings aim, recoil on accepted shots, brace on both sides and recover with reduced-motion support', async ({ page }, testInfo) => {
    let wire: WebSocketRoute | undefined, holdPresentation = false;
    let cache = new Map<number, BodyState>(), latest: GameState | undefined;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.routeWebSocket('**/socket.io/**', socket => {
        wire = socket;
        const server = socket.connectToServer();
        server.onMessage(message => {
            const text = message.toString();
            if (text.startsWith('42')) {
                const [event, data] = JSON.parse(text.slice(2));
                if (event === 'gameState') {
                    const state = reconstructGameState(cache, data as CompactGameState);
                    cache = state.bodyCache; latest = state.gameState;
                }
                if (holdPresentation) return;
            }
            socket.send(message);
        });
    });
    await page.goto('/');
    await page.getByRole('button', { name: /BATTLE/ }).click();
    await page.getByRole('button', { name: /READY FOR BATTLE/ }).click();
    await expect(page.locator('.battle-canvas')).toBeVisible();
    await expect.poll(async () => (await read(page)).livingKingsLoaded).toBe(12);
    await expect.poll(async () => (await read(page)).kingActions.left.ready).toBe(1);
    await page.getByRole('button', { name: 'Done building, ready for battle' }).click();
    await expect(page.getByRole('button', { name: 'Fire', exact: true })).toBeEnabled({ timeout: 15000 });
    await expect.poll(async () => (await read(page)).kingActions.left.aim).toBe(1);
    await frameKing(page, 'left');
    await page.screenshot({ path: `output/king-actions-v7/${testInfo.project.name}-aim.png` });
    await page.locator('#cannon-power').fill('65');
    await page.getByRole('button', { name: 'Fire', exact: true }).click();
    await expect.poll(async () => (await read(page)).kingActions.left.mode, { intervals: [10, 20] }).toBe('recoil');
    const launch = await read(page);
    expect(launch.shot.side).toBe('left');
    expect(launch.presentation.projectiles.length).toBeGreaterThan(0);
    await expect.poll(async () => (await read(page)).kingActions.left.mode, { intervals: [10, 20] }).toBe('recover');
    await page.screenshot({ path: `output/king-actions-v7/${testInfo.project.name}-recovery.png` });
    await page.waitForTimeout(800);
    // Freeze only this client's event presentation. Fixtures never mutate the real server.
    holdPresentation = true;
    for (const [index, side] of (['left', 'right'] as const).entries()) {
        const target = latest!.kings[side];
        const enemy: Side = side === 'left' ? 'right' : 'left';
        const facing = side === 'left' ? 1 : -1;
        wire!.send(`42${JSON.stringify(['phase_change', { phase: 'combat', turnPlayer: enemy, endsAt: Date.now() + 25000 }])}`);
        wire!.send(`42${JSON.stringify(['gameState', {
            f: 1, t: Date.now(), u: [], r: [], k: { l: latest!.kings.left, r: latest!.kings.right },
            n: [...latest!.bodies.filter(body => body.label !== 'projectile'), {
                id: 990000 + index, label: 'projectile', side: enemy, material: 'projectile', isStatic: false, circleRadius: 9,
                width: 18, height: 18, angle: 0, blockHp: null, blockMaxHp: null,
                position: { x: target.x! + facing * 210, y: target.y! - 20 }, velocity: { x: -facing * 20, y: 2 },
            }],
        }])}`);
        await expect.poll(async () => (await read(page)).kingActions[side].mode).toBe('brace');
        await expect.poll(async () => (await read(page)).kingActions[side].brace).toBe(1);
        expect((await read(page)).kingActions[side].threat).toBeGreaterThan(0);
        await frameKing(page, side);
        await page.screenshot({ path: `output/king-actions-v7/${testInfo.project.name}-${side}-brace.png` });
        wire!.send(`42${JSON.stringify(['king_damage', { side, hp: 90, maxHp: 100, damage: 10, source: 'projectile' }])}`);
        await expect.poll(async () => (await read(page)).kingActions[side].mode, { intervals: [10, 20] }).toBe('hit');
        await expect.poll(async () => (await read(page)).kingActions[side].mode, { intervals: [20, 40] }).toBe('recover');
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(async () => (await read(page)).rendering.reducedMotion).toBe(true);
    const still = (await read(page)).livingKingStates;
    await page.waitForTimeout(200);
    expect((await read(page)).livingKingStates).toEqual(still);
    for (const side of ['left', 'right']) {
        const action = (await read(page)).kingActions[side];
        expect([action.ready, action.aim, action.brace, action.recoil, action.recover]).toEqual([0, 0, 0, 0, 0]);
    }
    expect(errors).toEqual([]);
});
