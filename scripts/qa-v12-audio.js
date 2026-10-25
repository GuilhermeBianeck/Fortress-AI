async (page) => {
    const context = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const target = await context.newPage(), errors = [], obsolete = [];
    target.on('pageerror', error => errors.push(error.message));
    target.on('response', response => { if (response.status() >= 400 && response.url().includes('/audio/')) errors.push(response.url()); });
    target.on('request', request => { if (/royal-menu-(intro|loop)/.test(request.url())) obsolete.push(request.url()); });
    await target.addInitScript(() => {
        localStorage.setItem('fortress_muted', '0');
        window.__qaDecks = [];
        const original = AudioContext.prototype.createMediaElementSource;
        AudioContext.prototype.createMediaElementSource = function(media) {
            const source = original.call(this, media), analyser = this.createAnalyser(); source.connect(analyser);
            const connect = source.connect.bind(source);
            source.connect = target => { window.__qaDecks.push({ media, analyser, context: this, gain: target }); return connect(target); };
            return source;
        };
    });
    const read = () => target.evaluate(() => window.__qaDecks.map(({ media, analyser, context, gain }) => {
        const values = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(values);
        return { time: media.currentTime, duration: media.duration, paused: media.paused, context: context.state, gain: gain.gain.value,
            rms: Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length) };
    }));
    try {
        await target.goto('http://127.0.0.1:5174/');
        await target.getByRole('textbox', { name: 'Player name' }).click();
        await target.waitForFunction(() => window.__qaDecks[0]?.media.currentTime > 1);
        const initial = await read(); await target.waitForTimeout(8000); const played = await read();
        if (played[0].time < initial[0].time + 7 || played[0].rms < 0.00001) throw new Error('Theme decode/playback stalled');
        await target.getByRole('button', { name: 'Mute sounds', exact: true }).click();
        await target.waitForFunction(() => window.__qaDecks.every(d => d.media.paused));
        const stopped = await read(); await target.waitForTimeout(300); const held = await read();
        if (Math.abs(held[0].time - stopped[0].time) > 0.1) throw new Error('Mute did not pause music');
        await target.getByRole('button', { name: 'Unmute sounds', exact: true }).click();
        await target.waitForFunction(time => window.__qaDecks[0].media.currentTime > time + 0.2, held[0].time);
        await target.getByRole('button', { name: 'BATTLE vs Bot', exact: true }).click();
        await target.getByRole('button', { name: 'READY FOR BATTLE', exact: true }).click();
        await target.waitForFunction(() => window.render_game_to_text);
        await target.evaluate(() => { window.__qaDecks[0].media.currentTime = 171.04; });
        await target.waitForFunction(() => window.__qaDecks[1].media.currentTime > 0.2);
        await target.waitForFunction(() => window.__qaDecks[0].media.paused);
        const second = await read(); if (second[1].rms < 0.00001) throw new Error('Second theme silent');
        await target.evaluate(() => { window.__qaDecks[1].media.currentTime = 172.71; });
        await target.waitForFunction(() => window.__qaDecks[1].media.paused);
        await target.waitForFunction(() => window.__qaDecks[0].media.currentTime > 0.2);
        if (obsolete.length || errors.length) throw new Error('Audio errors or obsolete welcome loop requested');
        const report = { engine: page.context().browser().browserType().name(), initial, played, stopped, held, second, final: await read(), obsolete, errors,
            checks: ['trusted-gesture unlock', 'real media decode/RMS', '8s unseeked progression', 'mute pauses/unmute continues', 'battle transition', 'both crossfade boundaries with real decoders', 'no old welcome/loop asset requests'] };
        await page.evaluate(report => { window.__v12AudioReport = report; }, report); return report;
    } finally { await context.close(); }
}
