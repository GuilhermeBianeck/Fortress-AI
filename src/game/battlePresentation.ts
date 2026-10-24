export function renderPixelRatio(width: number, height: number, deviceRatio: number) {
    const area = Math.max(1, width * height);
    return Math.min(3, Math.max(1, deviceRatio || 1), Math.max(1, Math.sqrt(4_194_304 / area)));
}

export function sceneryPlacement(width: number, height: number, imageWidth: number, imageHeight: number, camera: number) {
    const w = Math.max(width * 1.08, height * 1.08 * imageWidth / imageHeight);
    const h = w * imageHeight / imageWidth;
    const focus = w > width * 1.5 ? 0.65 : 0.5;
    return { x: width / 2 - w * focus - (camera - 600) * 0.018, y: -height * 0.06, width: w, height: h };
}

export function groundTextureColumn(x: number, period = 360) {
    return ((x % period) + period) % period / period;
}

export function healthPanel(width: number, height: number, side: 'left' | 'right') {
    const compact = width < 600 || height < 300;
    const w = Math.min(compact ? 184 : 280, (width - 24) / 2);
    return { x: side === 'left' ? 10 : width - w - 10,
        y: height < 330 && width > 640 ? 60 : width < 640 ? 74 : width < 1100 ? 78 : 86,
        width: w, height: compact ? 50 : 68, compact, portraitWidth: compact ? 28 : 44 };
}

export function atmosphericColor(r: number, g: number, b: number): readonly number[] {
    const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
    return [atmosphericChannel(r, luminance, 201), atmosphericChannel(g, luminance, 221), atmosphericChannel(b, luminance, 230)];
}

function atmosphericChannel(channel: number, luminance: number, fog: number) {
    const muted = (luminance + (channel - luminance) * 0.58 - 128) * 0.86 + 128;
    return Math.round(muted * 0.86 + fog * 0.14);
}

export function gradeBackgroundPixels(pixels: Uint8ClampedArray) {
    for (let i = 0; i < pixels.length; i += 4) {
        if (!pixels[i + 3]) continue;
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        pixels[i] = atmosphericChannel(r, luminance, 201);
        pixels[i + 1] = atmosphericChannel(g, luminance, 221);
        pixels[i + 2] = atmosphericChannel(b, luminance, 230);
    }
}
