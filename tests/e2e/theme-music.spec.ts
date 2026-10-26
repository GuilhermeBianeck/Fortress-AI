import { test, expect } from '@playwright/test';
import { chargeFire } from './helpers';

type DeckProbe = { media: HTMLAudioElement; analyser: AnalyserNode; context: AudioContext; gain: GainNode };
type Probe = Window & { musicDecks: DeckProbe[]; musicConnections: Map<AudioNode, AudioNode> };

test('full themes rotate smoothly, stay audible through battle, and respect mute', async ({ page }, testInfo) => {
    const errors: string[] = [], oldAudio: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && response.url().includes('/audio/')) errors.push(response.url()); });
    page.on('request', request => { if (/royal-menu-(intro|loop)/.test(request.url())) oldAudio.push(request.url()); });
    await page.addInitScript(() => {
        if (!sessionStorage.getItem('music_qa_initialized')) {
            localStorage.setItem('fortress_muted', '0');
            sessionStorage.setItem('music_qa_initialized', '1');
        }
        localStorage.setItem('fortress_has_played', '1');
        (window as Probe).musicDecks = [];
        const connections = new Map<AudioNode, AudioNode>();
        (window as Probe).musicConnections = connections;
        const gainConnect = GainNode.prototype.connect;
        GainNode.prototype.connect = function (target: AudioNode, output = 0, input = 0) {
            connections.set(this, target);
            return gainConnect.call(this, target, output, input);
        } as typeof gainConnect;
        const original = AudioContext.prototype.createMediaElementSource;
        AudioContext.prototype.createMediaElementSource = function (media) {
            const source = original.call(this, media);
            const analyser = this.createAnalyser();
            source.connect(analyser);
            const connect = source.connect.bind(source);
            source.connect = ((target: AudioNode) => {
                (window as Probe).musicDecks.push({ media, analyser, context: this, gain: target as GainNode });
                return connect(target);
            }) as typeof source.connect;
            return source;
        };
    });
    await page.goto('/');
    const state = () => page.evaluate(() => (window as Probe).musicDecks.map(({ media, context, gain, analyser }) => {
        const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
        return { time: media.currentTime, duration: media.duration, paused: media.paused, src: media.src,
            context: context.state, gain: gain.gain.value,
            rms: Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length) };
    }));
    expect(await state()).toEqual([]);
    await page.getByRole('textbox', { name: 'Player name' }).click();
    await expect.poll(async () => (await state())[0]?.time).toBeGreaterThan(0.5);
    expect((await state())[0].duration).toBeGreaterThan(176);
    await expect.poll(async () => (await state())[0].rms).toBeGreaterThan(0.0001);
    // Real, unseeked playback catches stalled streaming or repeated starts.
    await page.waitForTimeout(20000);
    expect((await state())[0].time).toBeGreaterThan(19);
    const position = (await state())[0].time;
    await page.getByRole('button', { name: 'Mute sounds', exact: true }).click();
    await expect.poll(async () => (await state()).every(deck => deck.paused)).toBe(true);
    await page.waitForTimeout(300);
    expect((await state())[0].time).toBeCloseTo(position, 0);
    await page.getByRole('button', { name: 'Unmute sounds', exact: true }).click();
    await expect.poll(async () => (await state())[0].time).toBeGreaterThan(position + 0.1);
    await page.getByRole('button', { name: /BATTLE/ }).click();
    await page.getByRole('button', { name: /READY FOR BATTLE/ }).click();
    await expect(page.locator('.battle-canvas')).toBeVisible();
    expect((await state())[0].time).toBeGreaterThan(position);
    expect((await state())[0].paused).toBe(false);
    const mix = () => page.evaluate(() => {
        const probe = window as Probe;
        const master = probe.musicConnections.get(probe.musicDecks[0].gain) as GainNode;
        const duck = probe.musicConnections.get(master) as GainNode;
        return { level: master.gain.value, duck: duck.gain.value };
    });
    await expect.poll(async () => (await mix()).level).toBeCloseTo(0.24, 2);
    await page.getByRole('button', { name: 'Done building, ready for battle' }).click();
    await expect(page.getByRole('button', { name: 'Fire', exact: true })).toBeEnabled({ timeout: 15000 });
    await chargeFire(page, 70);
    await expect.poll(async () => (await mix()).duck, { intervals: [10, 20] }).toBeLessThan(0.7);
    await expect.poll(async () => (await mix()).duck).toBeCloseTo(1, 2);
    await page.screenshot({ path: `output/music-v8/${testInfo.project.name}-battle.png` });
    // Exercise real media decoders and both boundaries without a six-minute test.
    await page.evaluate(() => { (window as Probe).musicDecks[0].media.currentTime = 174.84 - 3.8; });
    await expect.poll(async () => (await state())[1].time).toBeGreaterThan(0.2);
    await expect.poll(async () => (await state())[0].paused).toBe(true);
    await expect.poll(async () => (await state())[1].rms).toBeGreaterThan(0.0001);
    expect((await state())[1].duration).toBeGreaterThan(177);
    await page.evaluate(() => { (window as Probe).musicDecks[1].media.currentTime = 176.51 - 3.8; });
    await expect.poll(async () => (await state())[1].paused).toBe(true);
    await expect.poll(async () => (await state())[0].time).toBeGreaterThan(0.2);
    expect(await state()).toHaveLength(2);
    await page.getByRole('button', { name: 'Mute sounds', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Unmute sounds', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Player name' }).click();
    expect(await state()).toEqual([]);
    expect(oldAudio).toEqual([]);
    expect(errors).toEqual([]);
});
