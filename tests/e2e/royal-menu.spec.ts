import { test, expect } from '@playwright/test';

type Voice = { loop: boolean; duration: number; loopStart: number; loopEnd: number; offset: number; start: number; stop: number | null; peak: number };
type AudioProbe = Window & { menuVoices: Voice[] };

test('royal layers fit the reference stage and freeze with reduced motion', async ({ page }, testInfo) => {
    const failures: string[] = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('response', response => {
        if (response.status() >= 400 && /assets|sprites|audio/.test(response.url())) failures.push(response.url());
    });
    await page.goto('/');
    await expect(page.locator('.royal-wordmark img')).toBeVisible();
    for (const [width, height] of [[1440, 900], [1280, 720], [390, 844], [768, 1024], [844, 390], [320, 568]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(200);
        await expect.poll(() => page.locator('.menu-viewport img').evaluateAll(images => images.every(image => {
            const img = image as HTMLImageElement;
            return img.complete && img.naturalWidth > 0;
        }))).toBe(true);
        const fields = await page.locator('.menu-field input').all();
        for (const field of fields) {
            const box = (await field.boundingBox())!;
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width);
        }
        const battle = (await page.getByRole('button', { name: /BATTLE/ }).boundingBox())!;
        expect(battle.y + battle.height).toBeLessThanOrEqual(height);
        expect(battle.height).toBeGreaterThanOrEqual(44);
        const controls = await page.locator('.menu-controls > *').evaluateAll(elements => elements.map(element => {
            const { top, bottom } = element.getBoundingClientRect();
            return { top, bottom };
        }));
        for (let i = 1; i < controls.length; i++) expect(controls[i].top).toBeGreaterThanOrEqual(controls[i - 1].bottom);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `output/royal-menu-v4/${testInfo.project.name}-${width}x${height}.png` });
    }
    expect(await page.locator('.royal-corner').count()).toBe(2);
    expect(await page.locator('.royal-torch--flame img').first().evaluate(element => getComputedStyle(element).animationName)).toBe('royal-flame-dance');
    expect(await page.locator('.royal-torch--bowl img').first().evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.locator('.menu-viewport *').evaluateAll(elements => elements.every(element => getComputedStyle(element).animationName === 'none'))).toBe(true);
    expect(failures).toEqual([]);
});

test('welcome plays once, only instrumental music loops, mute never replays the greeting', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => { if (/royal-menu-(intro|loop)/.test(request.url())) requests.push(request.url()); });
    await page.addInitScript(() => {
        localStorage.setItem('fortress_muted', '0');
        localStorage.setItem('fortress_has_played', '1');
        const voices: Voice[] = [];
        (window as AudioProbe).menuVoices = voices;
        const createSource = AudioContext.prototype.createBufferSource;
        AudioContext.prototype.createBufferSource = function () {
            const source = createSource.call(this);
            const start = source.start.bind(source), stop = source.stop.bind(source);
            let entry: Voice | undefined;
            source.start = (...args: Parameters<typeof start>) => {
                if (source.loop && source.buffer) {
                    const samples = source.buffer.getChannelData(0);
                    let peak = 0;
                    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
                    entry = { loop: source.loop, duration: source.buffer.duration, loopStart: source.loopStart, loopEnd: source.loopEnd,
                        offset: args[1] ?? 0, start: performance.now(), stop: null, peak };
                    voices.push(entry);
                }
                start(...args);
            };
            source.stop = (...args: Parameters<typeof stop>) => {
                if (entry) entry.stop = performance.now();
                stop(...args);
            };
            return source;
        };
    });
    await page.goto('/');
    await page.waitForTimeout(350);
    expect(requests).toHaveLength(0);
    expect(await page.evaluate(() => (window as AudioProbe).menuVoices)).toEqual([]);
    await page.getByRole('textbox', { name: 'Player name' }).click();
    const voices = () => page.evaluate(() => (window as AudioProbe).menuVoices);
    await expect.poll(async () => (await voices()).length).toBe(1);
    expect((await voices())[0]).toMatchObject({ loop: true, duration: 7.6, loopStart: 6, loopEnd: 7.6, offset: 0, stop: null });
    expect((await voices())[0].peak).toBeGreaterThan(0.01);
    // Cross two real loop boundaries; a looping source must not create duplicate voices.
    await page.waitForTimeout(9600);
    expect(await voices()).toHaveLength(1);
    expect((await voices())[0].stop).toBeNull();
    await page.getByRole('button', { name: 'Mute sounds', exact: true }).click();
    await expect.poll(async () => (await voices())[0].stop).not.toBeNull();
    await page.getByRole('button', { name: 'Unmute sounds', exact: true }).click();
    await expect.poll(async () => (await voices()).length).toBe(2);
    expect((await voices())[1]).toMatchObject({ duration: 1.6, loopStart: 0, loopEnd: 1.6, stop: null });
    await page.waitForTimeout(3400);
    expect(await voices()).toHaveLength(2);
    await page.getByRole('button', { name: /BATTLE/ }).click();
    await expect(page.getByRole('button', { name: /READY FOR BATTLE/ })).toBeVisible();
    expect(await voices()).toHaveLength(2);
    await page.getByRole('button', { name: /READY FOR BATTLE/ }).click();
    await expect(page.locator('.battle-canvas')).toBeVisible();
    await expect.poll(async () => (await voices())[1].stop).not.toBeNull();
    expect(requests.filter(url => url.includes('royal-menu-intro'))).toHaveLength(1);
    expect(requests.filter(url => url.includes('royal-menu-loop'))).toHaveLength(1);
});
