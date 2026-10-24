import { test, expect, type Page } from '@playwright/test';

interface Readout {
    phase: string; turn: string; side: string; mode: string; artLoaded: number;
    aim: { pending: boolean; power: number; degrees: number };
    viewport: { width: number; height: number; scale: number; top: number };
    camera: number;
    kings: { left: { x: number; y: number } };
    bodies: { id: number; kind: string; x: number; y: number }[];
}
const read = (page: Page): Promise<Readout> => page.evaluate(() => JSON.parse((window as Window & { render_game_to_text: () => string }).render_game_to_text()));

async function start(page: Page) {
    await page.addInitScript(() => { localStorage.setItem('fortress_has_played', '1'); });
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Player name' }).fill('Cartoon QA');
    await page.getByRole('button', { name: /BATTLE/ }).click();
    await page.getByRole('button', { name: /READY FOR BATTLE/ }).click();
    await expect(page.locator('.battle-canvas')).toBeVisible();
    await expect.poll(async () => (await read(page)).artLoaded).toBe(4);
    await expect.poll(async () => (await read(page)).bodies.filter(b => b.kind === 'king').length).toBe(2);
}

async function fit(page: Page) {
    const bounds = await page.locator('.battle-canvas').boundingBox();
    const viewport = page.viewportSize()!;
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeGreaterThan(150);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
    for (const selector of ['.battle-dock', '.game-build-dock', '.battle-fire']) {
        const target = page.locator(selector);
        if (!await target.isVisible()) continue;
        const box = (await target.boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const state = await read(page);
    const groundY = (520 - state.viewport.top) * state.viewport.scale;
    expect(groundY).toBeGreaterThan(0);
    expect(groundY).toBeLessThan(bounds!.height);
    const colors = await page.locator('canvas').evaluate(canvas => {
        const c = canvas as HTMLCanvasElement;
        const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let green = 0, soil = 0;
        const unique = new Set<string>();
        for (let i = 0; i < data.length; i += 4 * 19) {
            const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
            if (g > r * 1.12 && g > b * 1.05) green++;
            if (r > g * 1.12 && g > b * 1.1) soil++;
            unique.add(`${r >> 4},${g >> 4},${b >> 4}`);
        }
        return { green, soil, unique: unique.size };
    });
    expect(colors.green).toBeGreaterThan(30);
    expect(colors.soil).toBeGreaterThan(30);
    expect(colors.unique).toBeGreaterThan(35);
}

test('cartoon battlefield fits every viewport and safely separates placement, inspection and firing', async ({ page, context }) => {
    const errors: string[] = [];
    const failures: string[] = [];
    const fireFrames: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && /sprites|assets/.test(r.url())) failures.push(r.url()); });
    page.on('websocket', socket => socket.on('framesent', frame => { if (String(frame.payload).includes('"fire_projectile"')) fireFrames.push(String(frame.payload)); }));
    await start(page);
    for (const [width, height] of [[1280,720], [390,844], [768,1024], [844,390], [320,568]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(350);
        await fit(page);
        if (width === 844) {
            await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeVisible();
            expect((await read(page)).viewport.top).toBe(240);
            await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
            await expect.poll(async () => (await read(page)).viewport.top).toBe(40);
            await page.getByRole('button', { name: 'Tactical view', exact: true }).click();
        }
        await page.screenshot({ path: `output/cartoon-v1/build-${width}x${height}.png` });
    }
    const canvas = page.locator('.battle-canvas');
    const ownBlocks = async () => (await read(page)).bodies.filter(b => b.kind !== 'king' && b.x < 1200).length;
    const count = await ownBlocks();
    await page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Wood', exact: true })).toBeDisabled();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + 180, box.y + 150); await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 150, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(200);
    expect(await ownBlocks()).toBe(count);
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    const cdp = await context.newCDPSession(page);
    const finger = { x: box.x + 140, y: box.y + 140 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...finger, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...finger, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...finger, id: 1 }, { x: finger.x + 60, y: finger.y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
    expect(await ownBlocks()).toBe(count);
    await page.getByRole('button', { name: 'Recenter battlefield' }).click();
    await page.waitForTimeout(400);
    const before = await read(page);
    const x = box.x + (before.kings.left.x + 60 - before.camera) * before.viewport.scale;
    const y = box.y + (330 - before.viewport.top) * before.viewport.scale;
    await page.mouse.click(x, y);
    await expect.poll(ownBlocks).toBe(count + 1);
    await page.getByRole('button', { name: 'Done building, ready for battle' }).click();
    await expect.poll(async () => (await read(page)).phase, { timeout: 15000 }).toBe('combat');
    await expect(page.getByRole('button', { name: 'Fire', exact: true })).toBeEnabled();
    const combat = (await canvas.boundingBox())!;
    await page.mouse.move(combat.x + 160, combat.y + 150); await page.mouse.down(); await page.mouse.up();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: combat.x + 160, y: combat.y + 150, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    expect(fireFrames).toHaveLength(0);
    const angle = page.locator('#cannon-angle');
    const power = page.locator('#cannon-power');
    await angle.focus(); await angle.press('End'); await expect(angle).toHaveValue('170');
    await angle.press('Home'); await expect(angle).toHaveValue('10');
    for (let i = 0; i < 35; i++) await angle.press('ArrowRight');
    await power.focus(); await power.press('End'); await expect(power).toHaveValue('100');
    await power.press('Home'); await expect(power).toHaveValue('5');
    for (let i = 0; i < 30; i++) await power.press('ArrowRight');
    await page.getByRole('button', { name: 'Inspect battlefield' }).click();
    await expect(page.getByRole('button', { name: 'Fire', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Inspect battlefield' }).click();
    await fit(page);
    await page.screenshot({ path: 'output/cartoon-v1/combat-320x568.png' });
    const fire = page.getByRole('button', { name: 'Fire', exact: true });
    await fire.click();
    await expect.poll(() => fireFrames.length).toBe(1);
    await expect(page.locator('.battle-fire')).toBeDisabled();
    await page.setViewportSize({ width: 390, height: 844 });
    expect((await read(page)).aim.pending).toBe(true);
    await expect(page.locator('.battle-fire')).toBeDisabled();
    await expect.poll(async () => (await read(page)).turn, { timeout: 20000 }).toBe('right');
    expect(fireFrames).toHaveLength(1);
    await fit(page);
    await page.screenshot({ path: 'output/cartoon-v1/combat-390x844.png' });
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
});

test('reduced-motion gameplay still renders complete art and reachable controls', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page);
    await fit(page);
    await expect(page.getByRole('button', { name: 'Mute sound' })).toBeVisible();
    await page.getByRole('button', { name: 'Mute sound' }).click();
    await expect(page.getByRole('button', { name: 'Unmute sound' })).toBeVisible();
    await page.screenshot({ path: 'output/cartoon-v1/reduced-motion-390x844.png' });
});

test('two players can chat and use the mirrored right-side cannon', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => localStorage.setItem('fortress_has_played', '1'));
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Player name' }).fill('Blue captain');
    await page.getByRole('radio', { name: 'PvP', exact: true }).click();
    await page.getByRole('button', { name: /BATTLE/ }).click();
    await expect(page.getByRole('heading', { name: 'Seeking Challenger...' })).toBeVisible();
    const otherContext = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
        const other = await otherContext.newPage();
        await other.addInitScript(() => localStorage.setItem('fortress_has_played', '1'));
        await other.goto('/');
        await other.getByRole('textbox', { name: 'Player name' }).fill('Red captain');
        await other.getByRole('radio', { name: 'PvP', exact: true }).click();
        await other.getByRole('button', { name: /BATTLE/ }).click();
        await page.getByRole('button', { name: /READY FOR BATTLE/ }).click();
        await other.getByRole('button', { name: /READY FOR BATTLE/ }).press('Enter');
        await expect(other.locator('.battle-canvas')).toBeVisible();
        await expect.poll(async () => (await read(other)).side).toBe('right');
        await expect.poll(async () => (await read(other)).artLoaded).toBe(4);
        await page.getByRole('button', { name: 'Open chat', exact: true }).click();
        await page.getByRole('textbox', { name: 'Chat message' }).fill('Royal crew ready');
        await page.getByRole('button', { name: 'Send chat message' }).click();
        await other.getByRole('button', { name: 'Open chat', exact: true }).click();
        await expect(other.locator('.game-chat-modal').getByText('Royal crew ready', { exact: true })).toBeVisible();
        await other.getByRole('textbox', { name: 'Chat message' }).fill('Cannons ready');
        await other.getByRole('button', { name: 'Send chat message' }).click();
        await expect(page.locator('.game-chat-modal').getByText('Cannons ready', { exact: true })).toBeVisible();
        await other.waitForTimeout(500);
        await other.screenshot({ path: 'output/cartoon-v1/pvp-mobile-chat.png' });
        await other.locator('.game-chat-modal').getByRole('button', { name: 'Close chat', exact: true }).click();
        await page.locator('.game-chat-modal').getByRole('button', { name: 'Close chat', exact: true }).click();
        await page.screenshot({ path: 'output/cartoon-v1/pvp-desktop-build.png' });
        await page.getByRole('button', { name: 'Done building, ready for battle' }).click();
        await other.getByRole('button', { name: 'Done building, ready for battle' }).click();
        await expect(page.getByRole('button', { name: 'Fire', exact: true })).toBeEnabled({ timeout: 15000 });
        await expect(other.locator('.battle-fire')).toBeDisabled();
        await page.getByRole('button', { name: 'Fire', exact: true }).click();
        await expect(other.getByRole('button', { name: 'Fire', exact: true })).toBeEnabled({ timeout: 20000 });
        await other.waitForTimeout(350);
        const state = await read(other);
        expect(state.turn).toBe('right');
        const cannonX = (2380 - state.camera) * state.viewport.scale;
        expect(cannonX).toBeGreaterThan(30);
        expect(cannonX).toBeLessThan(state.viewport.width - 20);
        await fit(other);
        await other.screenshot({ path: 'output/cartoon-v1/pvp-right-cannon.png' });
        await other.locator('#cannon-angle').press('End');
        await expect(other.locator('#cannon-angle')).toHaveValue('170');
        await other.getByRole('button', { name: 'Fire', exact: true }).click();
        await expect(other.locator('.battle-fire')).toBeDisabled();
    } finally {
        await otherContext.close();
    }
});
