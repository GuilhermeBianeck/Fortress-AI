async (page) => {
    const browser = page.context().browser(), engine = browser.browserType().name();
    const base = new URL(page.url()).origin;
    const reports = [], errors = [];
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 402, height: 874 }, { width: 768, height: 1024 }, { width: 568, height: 320 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
        const context = await browser.newContext({ viewport, hasTouch: true, deviceScaleFactor: 2 });
        const target = await context.newPage();
        try {
            await target.goto(base);
            await target.waitForFunction(() => !document.querySelector('main[inert]'));
            const battle = await target.getByRole('button', { name: 'BATTLE vs Bot', exact: true }).boundingBox();
            assert(battle.y + battle.height <= viewport.height, 'CTA below fold ' + JSON.stringify(viewport));
            const difficulty = await target.getByLabel('Solo difficulty').boundingBox();
            const solo = await target.getByRole('radio', { name: 'Solo', exact: true }).boundingBox();
            if (viewport.width < 841 && viewport.height > viewport.width) {
                assert(difficulty.y >= solo.y + solo.height, 'Difficulty squeezed beside mode');
                assert(difficulty.height >= 44, 'Difficulty target too short');
            }
            assert(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Menu horizontal overflow');
            await target.screenshot({ path: `output/playwright/v13-${engine}-menu-${viewport.width}.png` });
            reports.push({ viewport, battle, difficulty });
        } finally { await context.close(); }
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
    const target = await context.newPage();
    target.on('pageerror', e => errors.push(e.message));
    const read = () => target.evaluate(() => JSON.parse(window.render_game_to_text()));
    try {
        await target.goto(base + '/?debug=1');
        await target.getByRole('button', { name: 'BATTLE vs Bot', exact: true }).click();
        await target.getByRole('button', { name: 'READY FOR BATTLE', exact: true }).click();
        await target.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).bodies.length >= 2);
        await target.waitForFunction(() => JSON.parse(window.render_game_to_text()).livingKingsLoaded === 12);
        await target.waitForTimeout(250);
        const build = await read();
        assert(Math.abs(build.cannons.left.x - build.kings.left.x) <= 161, 'Cannon far from king');
        for (const x of [build.cannons.left.x, build.kings.left.x]) assert(x >= build.camera && x <= build.camera + build.viewport.worldWidth, 'Initial team framing uses stale fallback');
        await target.getByLabel('Block material', { exact: true }).selectOption('stone');
        await target.getByLabel('Block shape', { exact: true }).selectOption('beam');
        await target.screenshot({ path: `output/playwright/v13-${engine}-build.png` });
        await target.getByRole('button', { name: 'Done building, ready for battle', exact: true }).click();
        await target.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'reveal');
        await target.waitForTimeout(2000);
        const reveal = await read();
        const enemyX = reveal.kings.right.x;
        assert(enemyX >= reveal.camera && enemyX <= reveal.camera + reveal.viewport.worldWidth, 'Reveal never reached enemy');
        await target.screenshot({ path: `output/playwright/v13-${engine}-reveal.png` });
        await target.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'combat');
        await target.getByRole('button', { name: 'Enemy fortress', exact: true }).click();
        await target.waitForTimeout(200);
        const angle = target.locator('#cannon-angle'), power = target.locator('#cannon-power');
        await angle.focus(); await angle.press('Home'); for (let i = 0; i < 10; i++) await angle.press('ArrowRight');
        await power.focus(); await power.press('Home'); for (let i = 0; i < 28; i++) await power.press('ArrowRight');
        await target.evaluate(() => {
            window.__v13Frames = [];
            window.__v13Capturing = true;
            const capture = () => {
                if (!window.__v13Capturing) return;
                window.__v13Frames.push({ at: performance.now(), ...JSON.parse(window.render_game_to_text()) });
                requestAnimationFrame(capture);
            };
            requestAnimationFrame(capture);
        });
        await target.getByRole('button', { name: 'Fire', exact: true }).click();
        await target.waitForFunction(() => JSON.parse(window.render_game_to_text()).shotFocus.mode === 'impact', undefined, { timeout: 12000 });
        await target.screenshot({ path: `output/playwright/v13-${engine}-impact.png` });
        await target.waitForTimeout(1700);
        const frames = await target.evaluate(() => { window.__v13Capturing = false; return window.__v13Frames; });
        const flight = frames.filter(f => f.shotFocus.mode === 'flight' && f.presentation.projectiles.length);
        assert(flight.length > 5, 'No continuous flight captured');
        const outside = flight.filter(f => f.presentation.projectiles.some(b => {
            const x = (b.x - f.camera) * f.viewport.scale, y = (b.y - f.viewport.top) * f.viewport.scale;
            return b.x >= 0 && b.x <= 2400 && (x < -2 || x > f.viewport.width + 2 || y < -2 || y > f.viewport.height + 2);
        }));
        assert(!outside.length, `Ball offscreen ${outside.length}/${flight.length}`);
        const impacts = frames.filter(f => f.shotFocus.mode === 'impact');
        assert(impacts.length > 10, 'Impact hold too brief');
        const heldAfterTurn = impacts.some(f => f.turn === 'right');
        assert(heldAfterTurn, 'Next turn stole impact view');
        for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
            await target.setViewportSize(viewport);
            await target.waitForTimeout(250);
            assert(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Battle horizontal overflow');
            const overlap = await target.evaluate(() => {
                const names = ['.battle-camera', '.battle-aim-controls', '.battle-fire'];
                const boxes = names.map(n => document.querySelector(n).getBoundingClientRect());
                const labelsOverflow = [...document.querySelectorAll('.battle-aim-controls label')].some(label => label.querySelector('output').getBoundingClientRect().right > label.getBoundingClientRect().right + 1);
                return labelsOverflow || boxes.some((a, i) => boxes.some((b, j) => j > i && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1));
            });
            assert(!overlap, 'Combat controls overlap ' + JSON.stringify(viewport));
            await target.screenshot({ path: `output/playwright/v13-${engine}-combat-${viewport.width}.png` });
        }
        reports.push({ check: 'real phone reveal, closer cannon, enemy inspection then fire, full flight and impact through turn switch', flightFrames: flight.length, outside: outside.length, impactFrames: impacts.length, heldAfterTurn, receipt: impacts[0].shotFocus.receipt, errors });
        assert(!errors.length, errors.join('; '));
        await page.evaluate(report => { window.__v13Report = report; }, reports);
        return reports;
    } finally { await context.close(); }
}
