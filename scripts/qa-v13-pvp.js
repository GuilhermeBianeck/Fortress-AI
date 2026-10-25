async (page) => {
    const browser = page.context().browser(), base = new URL(page.url()).origin;
    const aContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const bContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const a = await aContext.newPage(), b = await bContext.newPage(), errors = [], reports = [];
    const read = target => target.evaluate(() => JSON.parse(window.render_game_to_text()));
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    for (const target of [a, b]) target.on('pageerror', e => errors.push(e.message));
    try {
        await a.goto(base); await b.goto(base);
        await a.getByRole('radio', { name: 'PvP', exact: true }).click();
        await a.getByRole('button', { name: 'Create room', exact: true }).click();
        const code = await a.locator('.menu-invite-code strong').textContent();
        await b.getByRole('textbox', { name: 'Room code', exact: true }).fill(code);
        await b.getByRole('button', { name: 'Join', exact: true }).click();
        for (const target of [a, b]) await target.getByRole('button', { name: 'READY FOR BATTLE', exact: true }).click();
        for (const target of [a, b]) await target.getByRole('button', { name: 'Done building, ready for battle', exact: true }).click();
        await a.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'combat');
        for (const target of [a, b]) {
            await target.evaluate(() => {
                window.__flightSamples = [];
                window.__capturing = true;
                const sample = () => {
                    if (!window.__capturing) return;
                    const state = JSON.parse(window.render_game_to_text());
                    if (state.shotFocus.mode === 'flight') window.__flightSamples.push(state);
                    requestAnimationFrame(sample);
                };
                requestAnimationFrame(sample);
            });
        }
        for (const [side, target] of [['left', a], ['right', b]]) {
            await target.getByRole('button', { name: 'Fire', exact: true }).waitFor();
            const angle = target.locator('#cannon-angle'), power = target.locator('#cannon-power');
            await angle.focus(); await angle.press('Home'); for (let i = 0; i < 10; i++) await angle.press('ArrowRight');
            await power.focus(); await power.press('Home'); for (let i = 0; i < 28; i++) await power.press('ArrowRight');
            await target.getByRole('button', { name: 'Fire', exact: true }).click();
            await target.waitForFunction(side => {
                const state = JSON.parse(window.render_game_to_text());
                return state.shotFocus.mode === 'impact' && state.shot?.side === side;
            }, side);
            await target.screenshot({ path: `output/playwright/v13-pvp-${side}.png` });
            const impact = await read(target);
            reports.push({ side, receipt: impact.shotFocus.receipt, camera: impact.camera });
            await target.waitForTimeout(1600);
        }
        for (const target of [a, b]) {
            const frames = await target.evaluate(() => { window.__capturing = false; return window.__flightSamples; });
            assert(frames.length > 10, 'Both players did not see continuous flight');
            const outside = frames.filter(f => f.presentation.projectiles.some(ball => {
                const x = (ball.x - f.camera) * f.viewport.scale, y = (ball.y - f.viewport.top) * f.viewport.scale;
                return ball.x >= 0 && ball.x <= 2400 && (x < -2 || x > f.viewport.width + 2 || y < -2 || y > f.viewport.height + 2);
            }));
            assert(!outside.length, 'Reverse flight clipped: ' + outside.length);
            reports.push({ viewer: (await read(target)).side, flightFrames: frames.length, outside: outside.length });
        }
        await b.getByRole('button', { name: 'Game settings', exact: true }).click();
        await b.getByLabel('Camera', { exact: true }).selectOption('manual');
        await b.getByRole('button', { name: 'Close game settings', exact: true }).click();
        await b.reload();
        await b.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).connection.syncRevision > 0);
        const restored = await read(b);
        assert(restored.cameraMotion.mode === 'manual', 'Manual preference lost');
        assert(restored.kings.right.x >= restored.camera && restored.kings.right.x <= restored.camera + restored.viewport.worldWidth, 'Right-side restored king clipped');
        await a.getByRole('button', { name: 'Game settings', exact: true }).click();
        await a.getByRole('button', { name: 'Leave battle', exact: true }).click();
        await a.getByRole('button', { name: 'Leave battle', exact: true }).click();
        await b.locator('.battle-result').waitFor({ state: 'visible' });
        assert(!errors.length, errors.join('; '));
        reports.push({ check: 'right-side Manual resume and final result visible after delay', errors });
        return reports;
    } finally { await aContext.close(); await bContext.close(); }
}
