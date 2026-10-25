async (page) => {
    const browser = page.context().browser(), context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const target = await context.newPage(); let wire;
    try {
        await target.routeWebSocket('**/socket.io/**', socket => {
            wire = socket; const server = socket.connectToServer();
            socket.onMessage(message => server.send(message)); server.onMessage(message => socket.send(message));
            socket.onClose(() => server.close());
        });
        await target.goto('http://127.0.0.1:5174/');
        await target.getByRole('button', { name: 'BATTLE vs Bot', exact: true }).click();
        await target.getByRole('button', { name: 'READY FOR BATTLE', exact: true }).click();
        await target.waitForFunction(() => window.render_game_to_text);
        wire.send('42' + JSON.stringify(['build_error', { message: 'QA previous request failed' }]));
        await target.locator('#build-status').filter({ hasText: 'QA previous request failed' }).waitFor();
        await target.waitForTimeout(2000);
        wire.send('42' + JSON.stringify(['build_status', { status: 'generating', message: 'QA new request is still generating' }]));
        await target.waitForTimeout(3500);
        if (!await target.locator('#build-status').filter({ hasText: 'QA new request is still generating' }).isVisible()) throw new Error('Old toast cleared the current AI operation');
        const report = { check: 'stale build-error timeout cannot clear a newer operation', paidRequestsIssued: 0 };
        await page.evaluate(report => { window.__v12StatusReport = report; }, report); return report;
    } finally { await context.close(); }
}
