async (page) => {
    const browser = page.context().browser(), engine = browser.browserType().name();
    const reports = [];
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 800 ? 3 : 2, isMobile: viewport.width < 800, hasTouch: true, reducedMotion: 'reduce' });
        const target = await context.newPage(), errors = [], checks = [];
        target.on('pageerror', error => errors.push(error.message));
        await target.addInitScript(() => {
            window.__qaSockets = new Set();
            const Original = window.WebSocket;
            window.WebSocket = class extends Original {
                constructor(...args) { super(...args); window.__qaSockets.add(this); this.addEventListener('close', () => window.__qaSockets.delete(this)); }
            };
        });
        const read = () => target.evaluate(() => JSON.parse(window.render_game_to_text()));
        try {
            await target.goto('http://127.0.0.1:5174/?debug=1');
            await target.waitForFunction(() => !document.querySelector('main[inert]'));
            const battle = target.getByRole('button', { name: 'BATTLE vs Bot', exact: true });
            const box = await battle.boundingBox(); assert(box && box.y >= 0 && box.y + box.height <= viewport.height, engine + ': primary CTA clipped ' + JSON.stringify(viewport));
            await target.getByLabel('Solo difficulty').selectOption('hard');
            await target.reload(); await target.waitForFunction(() => !document.querySelector('main[inert]'));
            assert(await target.getByLabel('Solo difficulty').inputValue() === 'hard', 'Difficulty did not persist');
            await target.screenshot({ path: 'output/playwright/v12-' + engine + '-menu-' + viewport.width + '.png' });
            checks.push('menu CTA/difficulty persistence');
            await battle.click(); await target.getByRole('button', { name: 'READY FOR BATTLE', exact: true }).click();
            await target.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).bodies.length >= 2);
            const before = await read();
            const canvas = target.getByLabel('Fortress battlefield'); const canvasBox = await canvas.boundingBox();
            const king = before.bodies.find(b => b.kind === 'king' && b.side === 'left');
            const x = canvasBox.x + (king.x - 100 - before.camera) * before.viewport.scale;
            const y = canvasBox.y + (king.y - 100 - before.viewport.top) * before.viewport.scale;
            if (x > canvasBox.x + 2 && x < canvasBox.x + canvasBox.width - 2 && y > canvasBox.y + 2 && y < canvasBox.y + canvasBox.height - 2) {
                const count = before.bodies.length; await target.touchscreen.tap(x, y);
                await target.waitForFunction(count => JSON.parse(window.render_game_to_text()).bodies.length > count, count);
                checks.push('native single-touch placement');
            }
            const placementCount = (await read()).bodies.filter(b => b.kind === 'wood').length;
            await target.mouse.move(canvasBox.x + 30, canvasBox.y + 30); await target.mouse.down();
            await canvas.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', bubbles: true }); await target.mouse.up();
            assert((await read()).diagnostics.pointers === 0, 'Cancelled pointer remained active');
            assert((await read()).bodies.filter(b => b.kind === 'wood').length === placementCount, 'Cancel placed a block');
            checks.push('cancelled pointer does not place/fire');
            await target.getByRole('button', { name: 'Done building, ready for battle', exact: true }).click();
            await target.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'combat');
            const ids = (await read()).bodies.filter(b => b.kind === 'king').map(b => b.id);
            await target.getByRole('button', { name: 'Fire', exact: true }).click();
            const flipped = viewport.width < viewport.height ? { width: 844, height: 390 } : { width: 390, height: 844 };
            await target.setViewportSize(flipped); await target.reload();
            await target.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).connection.syncRevision > 0);
            const restored = await read(); assert(restored.connection.fired && restored.aim.pending, 'Accepted shot was reset after reload');
            assert(JSON.stringify(restored.bodies.filter(b => b.kind === 'king').map(b => b.id)) === JSON.stringify(ids), 'Reload replaced kings');
            assert(restored.rendering.reducedMotion, 'Reduced motion not respected');
            checks.push('rotation/mid-shot reload retains kings/fired flag/reduced motion');
            await target.waitForFunction(() => {
                const state = JSON.parse(window.render_game_to_text());
                return state.artLoaded === 4 && state.battleArtLoaded === 8 && state.reactionsLoaded === 7 && state.livingKingsLoaded === 12;
            });
            await target.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const colors = await target.evaluate(() => {
                const canvas = document.querySelector('.battle-canvas'), ctx = canvas.getContext('2d');
                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data, colors = new Set();
                const stride = Math.max(4, Math.floor(pixels.length / 10000 / 4) * 4);
                for (let i = 0; i < pixels.length; i += stride) colors.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]);
                return colors.size;
            });
            assert(colors > 150, 'Canvas appears blank or art did not paint'); checks.push('all 31 art assets loaded and canvas pixel diversity verified');
            await target.screenshot({ path: 'output/playwright/v12-' + engine + '-resume-' + viewport.width + '.png' });
            if (viewport.width === 390) {
                await context.setOffline(true);
                await target.evaluate(() => { for (const socket of window.__qaSockets) socket.close(4001, 'QA connection switch'); });
                await target.waitForFunction(() => document.querySelector('main[inert]'));
                await target.waitForTimeout(5000); await context.setOffline(false);
                await target.waitForFunction(() => !document.querySelector('main[inert]'));
                assert((await read()).bodies.filter(b => b.kind === 'king').map(b => b.id).join() === ids.join(), 'Network restore replaced kings');
                checks.push('real five-second offline/reconnect disables mutations and resumes');
                const second = await context.newPage(); await second.goto('http://127.0.0.1:5174/');
                await second.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).connection.syncRevision > 0);
                await target.getByRole('status').filter({ hasText: 'active in another tab' }).waitFor();
                checks.push('shared-identity tab takeover notification'); await second.close();
            }
            assert(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
            assert(!errors.length, 'Browser errors: ' + errors.join('; '));
            reports.push({ engine, viewport, checks, errors, deviceScaleFactor: viewport.width < 800 ? 3 : 2 });
        } finally { await context.close(); }
    }
    await page.evaluate(report => { window.__v12MobileReport = report; }, reports);
    return reports;
}
