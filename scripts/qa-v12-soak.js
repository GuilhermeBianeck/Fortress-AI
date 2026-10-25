async (page) => {
    await page.goto('http://127.0.0.1:5174/?debug=1');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => !document.querySelector('main[inert]'));
    if (await page.getByRole('button', { name: 'BATTLE vs Bot', exact: true }).isVisible()) {
        await page.getByRole('button', { name: 'BATTLE vs Bot', exact: true }).click();
        await page.getByRole('button', { name: 'READY FOR BATTLE', exact: true }).click();
    } else await page.getByRole('button', { name: 'Mute sounds', exact: true }).first().click();
    await page.evaluate(() => {
        const report = window.__fortressSoak = { started: Date.now(), samples: [], errors: [], cycles: 0, transitions: [], finished: false };
        window.addEventListener('error', event => { if (report.errors.length < 30) report.errors.push(String(event.message).slice(0, 200)); });
        window.addEventListener('unhandledrejection', event => { if (report.errors.length < 30) report.errors.push(String(event.reason).slice(0, 200)); });
        window.confirm = () => true;
        let lastPhase = '', lastExit = Date.now();
        const click = (test) => { const button = [...document.querySelectorAll('button')].find(test); if (button && !button.disabled && !button.closest('[inert]')) button.click(); };
        const timer = setInterval(() => {
            const elapsed = Date.now() - report.started;
            const state = window.render_game_to_text ? JSON.parse(window.render_game_to_text()) : null;
            const phase = state?.phase ?? 'menu';
            if (phase !== lastPhase) { if (report.transitions.length < 200) report.transitions.push({ elapsed, phase }); lastPhase = phase; }
            report.samples.push({ elapsed, phase, connection: state?.connection, diagnostics: state?.diagnostics,
                rendering: state?.rendering, snapshots: state?.presentation.snapshots, particles: state?.particles.total,
                bodies: state?.bodies.length, nodes: document.getElementsByTagName('*').length,
                overflow: document.documentElement.scrollWidth > innerWidth });
            if (report.samples.length > 245) report.samples.shift();
            if (elapsed >= 20 * 60_000) { clearInterval(timer); report.finished = true; report.ended = Date.now(); sessionStorage.setItem('fortress_soak_receipt', JSON.stringify(report)); return; }
            if (state?.connection.paused) return;
            if (Date.now() - lastExit > 150_000 && state && phase !== 'result') {
                click(button => button.getAttribute('aria-label') === 'Game settings');
                setTimeout(() => {
                    click(button => /Leave battle/i.test(button.textContent));
                    setTimeout(() => click(button => /Leave battle/i.test(button.textContent)), 0);
                }, 0);
                lastExit = Date.now(); report.cycles++;
            } else if (phase === 'menu') {
                click(button => button.textContent.includes('BATTLE') && button.textContent.includes('vs Bot'));
                click(button => button.textContent.trim() === 'READY FOR BATTLE');
            } else if (phase === 'build') click(button => button.textContent.trim() === 'DONE');
            else if (phase === 'combat') click(button => button.classList.contains('battle-fire') && button.textContent.trim() === 'Fire');
            else if (phase === 'result') click(button => /Rematch/i.test(button.textContent));
        }, 5000);
    });
    return { started: true, viewport: '390x844', durationMinutes: 20 };
}
