async (page) => {
    const browser = page.context().browser(), context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const target = await context.newPage(), errors = [];
    const base = new URL(page.url()).origin;
    target.on('pageerror', error => errors.push(error.message));
    try {
        await target.goto(base);
        await target.getByRole('button', { name: 'BATTLE vs Bot', exact: true }).click();
        await target.getByRole('button', { name: 'READY FOR BATTLE', exact: true }).click();
        await target.getByRole('button', { name: 'Done building, ready for battle', exact: true }).click();
        await target.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).phase === 'combat');
        const angle = target.locator('#cannon-angle'), power = target.locator('#cannon-power');
        await angle.focus(); await angle.press('Home'); for (let i = 0; i < 25; i++) await angle.press('ArrowRight');
        await power.focus(); await power.press('Home'); for (let i = 0; i < 35; i++) await power.press('ArrowRight');
        await target.evaluate(() => {
            window.__v14Samples = []; window.__v14Capture = true;
            const tick = () => {
                if (!window.__v14Capture) return;
                const state = JSON.parse(window.render_game_to_text());
                window.__v14Samples.push({ at: performance.now(), camera: state.camera, viewport: state.viewport,
                    mode: state.shotFocus.mode, balls: state.presentation.projectiles, turn: state.turn });
                requestAnimationFrame(tick);
            }; requestAnimationFrame(tick);
        });
        await target.getByRole('button', { name: 'Fire', exact: true }).click();
        await target.waitForFunction(() => JSON.parse(window.render_game_to_text()).shotFocus.mode === 'flight');
        await target.waitForTimeout(500); await target.screenshot({ path: `output/playwright/v14-${browser.browserType().name()}-flight-1.png` });
        await target.waitForTimeout(600); await target.screenshot({ path: `output/playwright/v14-${browser.browserType().name()}-flight-2.png` });
        await target.waitForFunction(() => JSON.parse(window.render_game_to_text()).shotFocus.mode === 'impact', undefined, { timeout: 18000 });
        await target.screenshot({ path: `output/playwright/v14-${browser.browserType().name()}-impact.png` });
        const samples = await target.evaluate(() => { window.__v14Capture = false; return window.__v14Samples; });
        const flight = samples.filter(sample => sample.mode === 'flight' && sample.balls.length);
        const duration = flight.at(-1).at - flight[0].at;
        const outside = flight.filter(sample => sample.balls.some(ball => {
            const x = (ball.x - sample.camera) * sample.viewport.scale, y = (ball.y - sample.viewport.top) * sample.viewport.scale;
            return ball.x >= 0 && ball.x <= 2400 && (x < -2 || x > 392 || y < -2 || y > sample.viewport.height + 2);
        }));
        if (duration < 1500) throw new Error('Arc still too fast: ' + duration);
        if (outside.length || errors.length) throw new Error(JSON.stringify({ outside: outside.length, errors }));
        return { engine: browser.browserType().name(), angle: 35, power: 40, flightMs: duration, samples: flight.length, outside: outside.length, errors };
    } finally { await context.close(); }
}
