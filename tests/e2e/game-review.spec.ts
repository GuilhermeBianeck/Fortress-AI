import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { reconstructGameState } from '../../src/hooks/gameStateSnapshot';
import type { BodyState, CompactGameState, GameState } from '../../src/types';
import { chargeFire } from './helpers';

const read = (page: Page) => page.evaluate(() => JSON.parse((window as Window & { render_game_to_text: () => string }).render_game_to_text()));

test('reveal, turn handoffs and real shots have bounded continuous camera movement', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: /BATTLE/ }).click();
    await page.getByRole('button', { name: /READY FOR BATTLE/ }).click();
    await expect(page.locator('.battle-canvas')).toBeVisible();
    await expect.poll(async () => (await read(page)).bodies.filter((body: BodyState & { kind: string }) => body.kind === 'king').length).toBe(2);
    for (const body of (await read(page)).bodies.filter((body: { kind: string }) => body.kind === 'king')) {
        expect(body.width).toBe(32); expect(body.height).toBe(64); expect(body.angle).toBe(0);
    }
    await page.evaluate(() => {
        const host = window as Window & { reviewSamples?: unknown[]; stopReviewCapture?: () => void; render_game_to_text: () => string };
        host.reviewSamples = [];
        let running = true;
        host.stopReviewCapture = () => { running = false; };
        const capture = () => {
            const state = JSON.parse(host.render_game_to_text());
            host.reviewSamples!.push({ t: performance.now(), x: state.camera, width: state.viewport.worldWidth,
                phase: state.phase, turn: state.turn, velocity: state.cameraMotion.velocity,
                snapshots: state.presentation.snapshots, following: state.cameraMotion.following, handoff: state.cameraMotion.handoff });
            if (running) requestAnimationFrame(capture);
        };
        requestAnimationFrame(capture);
    });
    await page.getByRole('button', { name: 'Done building, ready for battle' }).click();
    await expect(page.getByRole('button', { name: 'Fire', exact: true })).toBeEnabled({ timeout: 15000 });
    await chargeFire(page, 70);
    await expect.poll(async () => (await read(page)).turn, { timeout: 12000 }).toBe('right');
    await page.waitForTimeout(5000);
    const samples = await page.evaluate(() => {
        const host = window as Window & { reviewSamples: { t: number; x: number; width: number; velocity: number; phase: string; turn: string; snapshots: number; following: number | null; handoff: { type: string; age: number } | null }[]; stopReviewCapture: () => void };
        host.stopReviewCapture(); return host.reviewSamples;
    });
    expect(samples.length).toBeGreaterThan(200);
    let moving = 0, maxScreensPerSecond = 0, dissolvedHandoffs = 0;
    for (let i = 1; i < samples.length; i++) {
        const previous = samples[i - 1], current = samples[i], seconds = (current.t - previous.t) / 1000;
        if (seconds <= 0 || seconds > .1) continue;
        const speed = Math.abs((current.x + current.width / 2) - (previous.x + previous.width / 2)) / current.width / seconds;
        if (speed > 1.85) {
            expect(current.handoff?.type).toBe('dissolve');
            expect(current.handoff!.age).toBeLessThan(40);
            dissolvedHandoffs++;
            continue;
        }
        maxScreensPerSecond = Math.max(maxScreensPerSecond, speed);
        expect(speed).toBeLessThan(1.85);
        if (Math.abs(current.x - previous.x) > .05) moving++;
    }
    expect(moving).toBeGreaterThan(50);
    expect(samples.some(sample => sample.phase === 'reveal')).toBe(true);
    expect(samples.some(sample => sample.turn === 'right')).toBe(true);
    expect(samples.some(sample => sample.following !== null)).toBe(true);
    await testInfo.attach('camera-motion-review', { body: JSON.stringify({ maxScreensPerSecond, dissolvedHandoffs, samples }), contentType: 'application/json' });
    await page.screenshot({ path: `output/game-review-v9/${testInfo.project.name}-combat.png` });
    expect(errors).toEqual([]);
});

test('kings stay visually upright through falling, landing, death and reduced motion', async ({ page }, testInfo) => {
    let wire: WebSocketRoute | undefined, freeze = false;
    let cache = new Map<number, BodyState>(), latest: GameState | undefined;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.routeWebSocket('**/socket.io/**', socket => {
        wire = socket;
        const server = socket.connectToServer();
        server.onMessage(message => {
            if (message.toString().startsWith('42')) {
                const [event, data] = JSON.parse(message.toString().slice(2));
                if (event === 'gameState') { const reconstructed = reconstructGameState(cache, data as CompactGameState); cache = reconstructed.bodyCache; latest = reconstructed.gameState; }
                if (freeze) return;
            }
            socket.send(message);
        });
    });
    await page.goto('/'); await page.getByRole('button', { name: /BATTLE/ }).click();
    await page.getByRole('button', { name: /READY FOR BATTLE/ }).click();
    await expect(page.locator('.battle-canvas')).toBeVisible();
    await expect.poll(async () => (await read(page)).livingKingsLoaded).toBe(12);
    await page.waitForTimeout(800);
    freeze = true;
    // Presentation fixtures only; real falling/landing physics is covered by server tests.
    const send = (vy: number, hp = 100, angle = 2.7) => {
        const n = latest!.bodies.filter(body => body.label !== 'projectile').map(body => body.label === 'king' && body.side === 'left'
            ? { ...body, angle, velocity: { x: 0, y: vy } } : body);
        wire!.send(`42${JSON.stringify(['gameState', { f: 1, t: Date.now(), n, u: [], r: [], k: { l: { ...latest!.kings.left, hp }, r: latest!.kings.right } }])}`);
    };
    send(6);
    await expect.poll(async () => (await read(page)).kingActions.left.mode).toBe('airborne');
    await expect.poll(async () => (await read(page)).kingActions.left.airborne).toBe(1);
    await page.screenshot({ path: `output/game-review-v9/${testInfo.project.name}-airborne.png` });
    send(0);
    await expect.poll(async () => (await read(page)).kingActions.left.mode, { intervals: [20, 40] }).toBe('landing');
    await page.waitForTimeout(180);
    await page.screenshot({ path: `output/game-review-v9/${testInfo.project.name}-landing.png` });
    await expect.poll(async () => (await read(page)).kingActions.left.mode).toBe('ready');
    wire!.send(`42${JSON.stringify(['phase_change', { phase: 'combat', turnPlayer: 'left', endsAt: Date.now() + 25000 }])}`);
    await page.waitForTimeout(700);
    wire!.send(`42${JSON.stringify(['phase_change', { phase: 'combat', turnPlayer: 'right', endsAt: Date.now() + 25000 }])}`);
    await page.waitForFunction(() => {
        const view = JSON.parse((window as Window & { render_game_to_text: () => string }).render_game_to_text());
        return view.cameraMotion.handoff?.age > 80 && view.cameraMotion.handoff.age < 250;
    });
    await page.screenshot({ path: `output/game-review-v9/${testInfo.project.name}-handoff-mid.png` });
    await page.waitForTimeout(400);
    const framed = await read(page);
    const cannonX = (2380 - framed.camera) * framed.viewport.scale;
    expect(cannonX).toBeGreaterThan(20);
    expect(cannonX).toBeLessThan(framed.viewport.width - 20);
    expect(framed.cameraMotion.handoff).toBeNull();
    await page.screenshot({ path: `output/game-review-v9/${testInfo.project.name}-handoff-end.png` });
    wire!.send(`42${JSON.stringify(['phase_change', { phase: 'combat', turnPlayer: 'left', endsAt: Date.now() + 25000 }])}`);
    await page.waitForTimeout(500);
    const view = (await read(page)).viewport;
    const mapWidth = Math.min(176, Math.max(108, view.width * .27));
    await page.locator('.battle-canvas').click({ position: { x: view.width - mapWidth - 10 + mapWidth * .25, y: view.height - 32 } });
    await expect.poll(async () => { const state = await read(page); return Math.abs(state.camera - state.cameraMotion.target); }).toBeLessThan(2);
    send(0, 0);
    await expect.poll(async () => (await read(page)).kingPoses.left).toBe('defeat');
    await page.screenshot({ path: `output/game-review-v9/${testInfo.project.name}-defeat.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(async () => (await read(page)).rendering.reducedMotion).toBe(true);
    const frozen = (await read(page)).livingKingStates;
    await page.waitForTimeout(200);
    expect((await read(page)).livingKingStates).toEqual(frozen);
    expect(errors).toEqual([]);
});
