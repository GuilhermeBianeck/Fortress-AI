/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCanvas, loadImage } from 'canvas';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import reactions from '../../asset-workbench/cartoon-v2/manifest.json';
import rival from '../../asset-workbench/cartoon-v3/manifest.json';

const assetPath = (relative: string) => fileURLToPath(new URL(`../../asset-workbench/${relative}`, import.meta.url));

for (const [character, files] of Object.entries({
    ember: [
        { path: 'cartoon-v1/runtime/king.png', footBand: 278 },
        ...reactions.assets.map(asset => ({ path: `cartoon-v2/${asset.path}`, footBand: 278 })),
    ],
    ivory: rival.assets.map(asset => ({ path: `cartoon-v3/${asset.path}`, footBand: 286 })),
})) {
    test(`${character} has four complete alpha sprites with a consistent boot anchor`, async () => {
        assert.equal(files.length, 4);
        let target: { center: number; bottom: number } | undefined;
        for (const file of files) {
            const image = await loadImage(assetPath(file.path));
            assert.equal(image.width, 256); assert.equal(image.height, 320);
            const canvas = createCanvas(image.width, image.height);
            const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
            const rgba = ctx.getImageData(0, 0, image.width, image.height).data;
            let transparent = 0, left = image.width, right = -1, bottom = -1;
            for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
                const alpha = rgba[(y * image.width + x) * 4 + 3];
                if (!alpha) transparent++;
                if (x < 8 || y < 8 || x >= image.width - 8 || y >= image.height - 8) assert.ok(alpha < 16, file.path);
                if (alpha >= 128 && y >= file.footBand) {
                    left = Math.min(left, x); right = Math.max(right, x); bottom = Math.max(bottom, y);
                }
            }
            assert.ok(transparent / (image.width * image.height) > 0.2);
            assert.ok(right > left);
            const feet = { center: (left + right) / 2, bottom };
            target ??= feet;
            assert.ok(Math.abs(target.center - feet.center) <= 1, file.path);
            assert.ok(Math.abs(target.bottom - feet.bottom) <= 1, file.path);
        }
        assert.notDeepEqual(fs.readFileSync(assetPath(files[0].path)), fs.readFileSync(assetPath(character === 'ember' ? 'cartoon-v3/runtime/rival_idle.png' : 'cartoon-v1/runtime/king.png')));
    });
}
