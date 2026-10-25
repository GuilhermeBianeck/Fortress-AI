async (page) => {
    const browser = page.context().browser(), engine = browser.browserType().name();
    const contexts = await Promise.all([browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true }), browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })]);
    const a = await contexts[0].newPage(), b = await contexts[1].newPage(), checks = [], errors = [];
    let hold = false;
    const wires = new Set();
    await b.routeWebSocket('**/socket.io/**', wire => {
        if (hold) { wire.close(); return; }
        const server = wire.connectToServer(), pair = { wire, server }; wires.add(pair);
        wire.onMessage(message => server.send(message)); server.onMessage(message => wire.send(message));
        wire.onClose(() => { server.close(); wires.delete(pair); });
    });
    for (const target of [a, b]) {
        target.on('pageerror', error => errors.push(error.message));
        await target.addInitScript(() => {
            window.__qaSockets = new Set(); const Original = WebSocket;
            window.WebSocket = class extends Original { constructor(...args) { super(...args); window.__qaSockets.add(this); this.addEventListener('close', () => window.__qaSockets.delete(this)); } };
        });
    }
    try {
        await a.goto('http://127.0.0.1:5174/'); await b.goto('http://127.0.0.1:5174/');
        await a.getByRole('radio', { name: 'PvP', exact: true }).click();
        await a.getByRole('button', { name: 'Create room', exact: true }).click();
        const code = await a.locator('.menu-invite-code strong').textContent();
        await b.getByRole('textbox', { name: 'Room code', exact: true }).fill(code);
        await b.getByRole('button', { name: 'Join', exact: true }).click();
        await a.getByRole('button', { name: 'READY FOR BATTLE', exact: true }).click();
        await b.getByRole('button', { name: 'READY FOR BATTLE', exact: true }).click();
        await b.getByRole('button', { name: 'Game settings', exact: true }).click();
        await b.getByLabel('Camera', { exact: true }).selectOption('manual');
        await b.getByRole('button', { name: 'Close game settings', exact: true }).click();
        const cutAt = Date.now();
        hold = true; for (const { wire, server } of wires) { wire.close(); server.close(); }
        await a.locator('.match-pause-notice').waitFor();
        await a.waitForTimeout(250);
        const clock = await a.locator('.battle-phase-time').textContent(); await a.waitForTimeout(1200);
        if (await a.locator('.battle-phase-time').textContent() !== clock) throw new Error('Paused phase clock kept counting down');
        for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
            await a.setViewportSize(viewport); const box = await a.locator('.match-pause-notice').boundingBox();
            if (box.x < 0 || box.x + box.width > viewport.width || box.y < 0) throw new Error('Pause banner clipped');
            if (!await a.locator('main').getAttribute('inert').then(value => value !== null)) throw new Error('Paused mutations not inert');
            await a.screenshot({ path: 'output/playwright/v12-' + engine + '-paused-' + viewport.width + '.png' });
        }
        checks.push('opponent pause banner fits 320/390/844px and freezes countdown/mutations');
        hold = false; await b.reload(); await a.waitForFunction(() => !document.querySelector('main[inert]'));
        await b.waitForFunction(() => !document.querySelector('main[inert]'));
        for (const target of [a, b]) {
            const phase = await target.evaluate(() => window.render_game_to_text ? JSON.parse(window.render_game_to_text()).phase : 'menu');
            if (phase === 'result' || phase === 'menu') throw new Error('Pause/reconnect expired unexpectedly: ' + phase + ', elapsed=' + (Date.now() - cutAt));
            if (phase === 'build' && !await target.locator('.game-build-done').isDisabled()) await target.locator('.game-build-done').click();
        }
        await b.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).phase === 'combat');
        await b.reload(); await b.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).connection.syncRevision > 0);
        const state = await b.evaluate(() => JSON.parse(window.render_game_to_text()));
        if (state.side !== 'right' || state.cameraMotion.mode !== 'manual' || state.camera < 1500 || Math.abs(state.cameraMotion.velocity) > 0.01) throw new Error('Right-side Manual resume was framed incorrectly');
        checks.push('new-page right-side Manual resume frames own cannon without sweeping');
        await a.getByRole('button', { name: 'Game settings', exact: true }).click();
        await a.getByRole('button', { name: 'Leave battle', exact: true }).click(); await a.getByRole('button', { name: 'Leave battle', exact: true }).click();
        await b.locator('.battle-result').waitFor(); await b.reload(); await b.locator('.battle-result').waitFor();
        const result = await b.evaluate(() => JSON.parse(window.render_game_to_text())); if (result.phase !== 'result' || result.side !== 'right') throw new Error('Result resume failed');
        checks.push('completed result restores on reload without restarting match');
        if (errors.length) throw new Error(errors.join('; '));
        const report = { engine, checks, errors }; await page.evaluate(report => { window.__v12ResumeUIReport = report; }, report); return report;
    } finally { for (const context of contexts) await context.close(); }
}
