async (page) => {
    const browser = page.context().browser(), reports = [];
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const target = await context.newPage(), errors = [];
    target.on('pageerror', error => errors.push(error.message));
    const read = () => target.evaluate(() => JSON.parse(window.render_game_to_text()));
    try {
        await target.goto('http://127.0.0.1:5174/?debug=1');
        await target.getByRole('button', { name: 'BATTLE vs Bot', exact: true }).click();
        await target.getByRole('button', { name: 'READY FOR BATTLE', exact: true }).click();
        await target.waitForFunction(() => window.render_game_to_text);
        const cdp = await context.newCDPSession(target);
        const counts = [];
        for (let cycle = 0; cycle < 28; cycle++) {
            if (cycle) {
                await target.getByRole('button', { name: 'BATTLE vs Bot', exact: true }).click();
                await target.getByRole('button', { name: 'READY FOR BATTLE', exact: true }).click();
                await target.waitForFunction(() => window.render_game_to_text);
            }
            await target.getByRole('button', { name: 'Game settings', exact: true }).click();
            await target.getByRole('button', { name: 'Leave battle', exact: true }).click();
            await target.getByRole('button', { name: 'Leave battle', exact: true }).click();
            await target.getByRole('button', { name: 'BATTLE vs Bot', exact: true }).waitFor();
            await target.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await cdp.send('HeapProfiler.collectGarbage');
            counts.push({ cycle: cycle + 1, ...(await cdp.send('Memory.getDOMCounters')), activeElements: await target.evaluate(() => document.getElementsByTagName('*').length), historyRows: await target.locator('.campaign-history li').count() });
        }
        if (counts.at(-1).jsEventListeners > counts[2].jsEventListeners + 15) throw new Error('Native event listeners grow across visits');
        if (counts.at(-1).nodes > counts[22].nodes + 50) throw new Error('DOM counts grow after the 20-history-entry cap: ' + JSON.stringify(counts.slice(-7)));
        reports.push({ check: '28 real enter/confirmed-leave cycles with forced-GC native listener counters and history-cap plateau', counts });
        await target.getByRole('button', { name: 'BATTLE vs Bot', exact: true }).click();
        await target.getByRole('button', { name: 'READY FOR BATTLE', exact: true }).click();
        await target.getByRole('button', { name: 'Done building, ready for battle', exact: true }).click();
        await target.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'combat');
        const before = await read();
        const canvas = await target.getByLabel('Fortress battlefield').boundingBox();
        const y = canvas.y + Math.min(100, canvas.height / 2);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 130, y, id: 1 }, { x: 240, y, id: 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 90, y, id: 1 }, { x: 200, y, id: 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const after = await read();
        if (after.aim.pending || after.bodies.some(b => b.kind === 'projectile') || after.diagnostics.pointers) throw new Error('Two-finger pan fired or left pointers behind');
        if (after.cameraMotion.target <= before.cameraMotion.target) throw new Error('Two-finger pan did not move the camera target');
        reports.push({ check: 'native two-finger pan without firing or stuck pointers' });
        await target.getByRole('button', { name: 'Game settings', exact: true }).click();
        await target.getByLabel('Camera', { exact: true }).selectOption('manual');
        const dialog = target.getByRole('dialog', { name: 'Game settings' });
        for (let i = 0; i < 8; i++) { await target.keyboard.press('Tab'); if (!await dialog.evaluate(node => node.contains(document.activeElement))) throw new Error('Focus escaped settings'); }
        await target.keyboard.press('Escape'); await target.reload();
        await target.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).connection.syncRevision > 0);
        if ((await read()).cameraMotion.mode !== 'manual') throw new Error('Camera preference was lost');
        reports.push({ check: 'settings focus trap and saved Manual preference on reload' });
        if (errors.length) throw new Error(errors.join('; '));
        await page.evaluate(report => { window.__v12ExtraReport = report; }, { reports, errors });
        return { reports, errors };
    } finally { await context.close(); }
}
