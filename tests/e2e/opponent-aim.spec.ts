import { test, expect, type Page } from '@playwright/test';

const read = (page: Page) => page.evaluate(() => JSON.parse((window as Window & { render_game_to_text: () => string }).render_game_to_text()));

test('both players see validated opponent aim, charging, cancel and accepted fire', async ({ page: a, browser }, info) => {
    const context = await browser.newContext({ viewport: a.viewportSize()! });
    const b = await context.newPage();
    let dropPreviews = false;
    await b.routeWebSocket('**/socket.io/**', socket => {
        const server = socket.connectToServer();
        server.onMessage(message => {
            if (dropPreviews && message.toString().startsWith('42["aim_preview",')) return;
            socket.send(message);
        });
    });
    const errors: string[] = [];
    for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message));
    try {
        await a.goto('/'); await b.goto(new URL(a.url()).origin);
        await a.getByRole('radio', { name: 'PvP', exact: true }).click();
        await a.getByRole('button', { name: 'Create room', exact: true }).click();
        await expect(a.locator('.menu-invite-code strong')).toHaveText(/^[A-Z0-9]{6}$/);
        const code = (await a.locator('.menu-invite-code strong').textContent())!;
        await b.goto(`${new URL(a.url()).origin}/?room=${code}`);
        for (const page of [a, b]) await page.getByRole('button', { name: 'READY FOR BATTLE', exact: true }).click();
        for (const page of [a, b]) await page.getByRole('button', { name: 'Done building, ready for battle', exact: true }).click();

        for (const [side, shooter, observer] of [['left', a, b], ['right', b, a]] as const) {
            const fire = shooter.locator('.battle-fire');
            await expect(fire).toBeEnabled({ timeout: 22000 });
            const angle = shooter.locator('#cannon-angle');
            await angle.focus();
            for (let i = 0; i < 10; i++) await angle.press('ArrowRight');
            const target = Number(await angle.inputValue()) * Math.PI / 180;
            await observer.getByRole('button', { name: 'Enemy fortress', exact: true }).click();
            await expect.poll(async () => Math.abs((await read(observer)).opponentPreparation.angle - target)).toBeLessThan(.015);
            await fire.focus(); await shooter.keyboard.down('Enter');
            await expect.poll(async () => (await read(observer)).kingActions[side].mode).toBe('charge');
            await expect.poll(async () => (await read(observer)).kingActions[side].charge).toBeGreaterThan(.3);
            expect((await read(observer)).opponentPreparation.preview.side).toBe(side);
            await expect(observer.locator('.battle-phase-title')).toHaveText("OPPONENT'S TURN");
            expect((await read(observer)).shot?.side).not.toBe(side);
            await observer.screenshot({ path: `output/playwright/v17-${info.project.name}-${side}-charge.png` });
            if (side === 'left') {
                dropPreviews = true;
                await expect.poll(async () => (await read(observer)).opponentPreparation.preview).toBeNull();
                await expect.poll(async () => (await read(observer)).kingActions[side].charge).toBe(0);
                dropPreviews = false;
            }
            await shooter.getByRole('button', { name: 'Enemy fortress', exact: true }).focus();
            await shooter.keyboard.up('Enter');
            await expect.poll(async () => (await read(observer)).kingActions[side].charge).toBe(0);
            expect((await read(shooter)).aim.pending).toBe(false);
            await fire.focus(); await shooter.keyboard.down('Enter');
            await shooter.waitForTimeout(650);
            await shooter.keyboard.up('Enter');
            await expect.poll(async () => (await read(observer)).shot?.side).toBe(side);
            await expect.poll(async () => (await read(observer)).opponentPreparation.preview).toBeNull();
            await expect.poll(async () => (await read(observer)).kingActions[side].charge).toBe(0);
        }
        // A real reload pauses both viewers and must not replay a previously held charge.
        await expect(a.locator('.battle-fire')).toBeEnabled({ timeout: 22000 });
        await a.locator('.battle-fire').focus(); await a.keyboard.down('Enter');
        await expect.poll(async () => (await read(b)).kingActions.left.mode).toBe('charge');
        await b.reload();
        await b.waitForFunction(() => typeof (window as Window & { render_game_to_text?: unknown }).render_game_to_text === 'function');
        await expect.poll(async () => (await read(b)).connection.syncRevision).toBeGreaterThan(0);
        await expect.poll(async () => (await read(a)).connection.paused).toBe(false);
        await a.keyboard.up('Enter');
        expect((await read(a)).aim.charging).toBe(false);
        expect((await read(a)).aim.pending).toBe(false);
        expect((await read(b)).aim.charging).toBe(false);
        await expect.poll(async () => (await read(b)).kingActions.left.charge).toBe(0);
        expect(errors).toEqual([]);
    } finally { await context.close(); }
});
