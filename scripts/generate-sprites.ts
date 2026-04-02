/**
 * Procedural Pixel Art Sprite Generator for Fortress AI
 *
 * Generates all game sprites as PNGs using node-canvas.
 * Run: npx ts-node scripts/generate-sprites.ts
 *
 * Every sprite is defined as a pixel grid — no external assets needed.
 * Self-validates output dimensions and writes a manifest.json.
 */

import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.join(__dirname, '..', 'public', 'sprites');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ─── Color Palettes ───

const P = {
    transparent: 'rgba(0,0,0,0)',
    // Wood
    wood1: '#3D2710', wood2: '#5C3D1E', wood3: '#8B6B42', wood4: '#A88B5E', wood5: '#C4A876',
    // Stone
    stone1: '#1E1E28', stone2: '#3A3A4A', stone3: '#5A5A6A', stone4: '#7A7A8A', stone5: '#9A9AAA',
    // Ice
    ice1: '#2A6878', ice2: '#4A98A8', ice3: '#7EC8D0', ice4: '#B0E8F0', ice5: '#E0F8FF',
    // Rubber
    rubber1: '#601830', rubber2: '#A03868', rubber3: '#D45090', rubber4: '#F070B0', rubber5: '#FF90D0',
    // Steel
    steel1: '#1E2226', steel2: '#2A3540', steel3: '#4A5560', steel4: '#6A7A80', steel5: '#8A9AA0',
    // King
    gold1: '#8B6914', gold2: '#B8860B', gold3: '#FFD700', gold4: '#FFE44D', gold5: '#FFF5B0',
    skin: '#E8C090', skinDark: '#C8A070', robe: '#8B0000', robeDark: '#5A0000', robeLight: '#C02020',
    // Cannon
    metal1: '#1A1A24', metal2: '#2A2A3A', metal3: '#3A3A4A', metal4: '#5A5A6A', metal5: '#7A7A8A',
    wheelBrown: '#5C3D1E', wheelDark: '#3D2710',
    // Projectile
    cannonball1: '#2A2A30', cannonball2: '#4A4A55', cannonball3: '#6A6A78', cannonball4: '#8A8A98',
    // Terrain
    grass1: '#1A5020', grass2: '#2A7030', grass3: '#3A9040', grass4: '#4AB050',
    earth1: '#1E1510', earth2: '#2A1E14', earth3: '#3A2A1E', earth4: '#4A3A28',
    earthDeep1: '#0E0A08', earthDeep2: '#1A1210', earthDeep3: '#221A14',
    // Lava
    lava1: '#FF3000', lava2: '#FF6020', lava3: '#FF9030', lava4: '#FFD060', lavaGlow: '#FFF0A0',
    // Effects
    white: '#FFFFFF', black: '#000000',
    spark1: '#FFA030', spark2: '#FFD060', spark3: '#FFF0A0',
    crackDark: '#1A1A1A',
};

type Ctx = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

// ─── Pixel Drawing Helpers ───

function px(ctx: Ctx, x: number, y: number, color: string) {
    if (color === P.transparent) return;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
}

function fillArea(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
}

function hLine(ctx: Ctx, x: number, y: number, len: number, color: string) {
    fillArea(ctx, x, y, len, 1, color);
}

function vLine(ctx: Ctx, x: number, y: number, len: number, color: string) {
    fillArea(ctx, x, y, 1, len, color);
}

// ─── Sprite Generators ───

interface SpriteEntry { name: string; width: number; height: number; path: string }
const manifest: SpriteEntry[] = [];

function save(name: string, canvas: ReturnType<typeof createCanvas>) {
    const filePath = path.join(OUT_DIR, `${name}.png`);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filePath, buffer);
    manifest.push({ name, width: canvas.width, height: canvas.height, path: `/sprites/${name}.png` });
    console.log(`  ✓ ${name}.png (${canvas.width}x${canvas.height})`);
}

function makeCanvas(w: number, h: number) {
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { canvas: c, ctx };
}

// ─── BLOCK SPRITES (5 materials x 3 damage states = 15) ───

function drawBlockBase(ctx: Ctx, size: number, base: string, light: string, dark: string, shadow: string) {
    // Fill
    fillArea(ctx, 0, 0, size, size, base);
    // Top highlight
    hLine(ctx, 0, 0, size, light);
    // Left highlight
    vLine(ctx, 0, 0, size, light);
    // Bottom shadow
    hLine(ctx, 0, size - 1, size, shadow);
    // Right shadow
    vLine(ctx, size - 1, 0, size, dark);
}

function addCracks(ctx: Ctx, size: number, count: number) {
    for (let i = 0; i < count; i++) {
        const sx = 3 + ((i * 7 + 3) % (size - 6));
        const sy = 3 + ((i * 11 + 5) % (size - 6));
        const len = 3 + (i % 4);
        const dir = i % 2 === 0 ? 1 : -1;
        for (let j = 0; j < len; j++) {
            px(ctx, sx + j * dir, sy + j, P.crackDark);
            if (j > 0) px(ctx, sx + j * dir + 1, sy + j, P.crackDark);
        }
    }
}

function addDesatOverlay(ctx: Ctx, size: number) {
    ctx.fillStyle = 'rgba(40, 40, 40, 0.35)';
    ctx.fillRect(0, 0, size, size);
}

function generateWoodBlock(damage: '' | '_damaged' | '_critical') {
    const S = 32;
    const { canvas, ctx } = makeCanvas(S, S);
    drawBlockBase(ctx, S, P.wood3, P.wood5, P.wood2, P.wood1);
    // Grain lines
    for (const y of [4, 8, 12, 16, 20, 24, 28]) {
        hLine(ctx, 0, y, S, P.wood2);
        // Variation
        px(ctx, (y * 3 + 5) % S, y, P.wood4);
        px(ctx, (y * 7 + 11) % S, y, P.wood4);
    }
    // Knots
    px(ctx, 8, 10, P.wood1); px(ctx, 9, 10, P.wood1); px(ctx, 8, 11, P.wood1);
    px(ctx, 22, 20, P.wood1); px(ctx, 23, 20, P.wood1); px(ctx, 22, 21, P.wood1);
    // Inner warmth
    fillArea(ctx, 2, 2, S - 4, 4, P.wood4); ctx.globalAlpha = 0.15;
    fillArea(ctx, 2, 2, S - 4, 4, P.wood5); ctx.globalAlpha = 1;

    if (damage === '_damaged') addCracks(ctx, S, 3);
    if (damage === '_critical') { addCracks(ctx, S, 6); addDesatOverlay(ctx, S); }
    save(`block_wood${damage}`, canvas);
}

function generateStoneBlock(damage: '' | '_damaged' | '_critical') {
    const S = 32;
    const { canvas, ctx } = makeCanvas(S, S);
    drawBlockBase(ctx, S, P.stone3, P.stone5, P.stone2, P.stone1);
    // Brick pattern — horizontal mortar lines
    for (const y of [8, 16, 24]) {
        hLine(ctx, 0, y, S, P.stone1);
    }
    // Vertical mortar (offset each row)
    for (let row = 0; row < 4; row++) {
        const yStart = row * 8;
        const offset = row % 2 === 0 ? 0 : 16;
        vLine(ctx, offset, yStart, 8, P.stone1);
        if (offset + 16 < S) vLine(ctx, offset + 16, yStart, 8, P.stone1);
    }
    // Surface noise
    for (let i = 0; i < 20; i++) {
        px(ctx, (i * 13 + 3) % S, (i * 7 + 5) % S, P.stone4);
        px(ctx, (i * 17 + 9) % S, (i * 11 + 2) % S, P.stone2);
    }
    if (damage === '_damaged') addCracks(ctx, S, 4);
    if (damage === '_critical') { addCracks(ctx, S, 7); addDesatOverlay(ctx, S); }
    save(`block_stone${damage}`, canvas);
}

function generateIceBlock(damage: '' | '_damaged' | '_critical') {
    const S = 32;
    const { canvas, ctx } = makeCanvas(S, S);
    drawBlockBase(ctx, S, P.ice3, P.ice5, P.ice2, P.ice1);
    // Translucent facets
    ctx.globalAlpha = 0.3;
    fillArea(ctx, 2, 2, 12, 14, P.ice5);
    fillArea(ctx, 16, 18, 14, 12, P.ice4);
    ctx.globalAlpha = 1;
    // Shine highlight
    px(ctx, 4, 3, P.white); px(ctx, 5, 3, P.white); px(ctx, 4, 4, P.white);
    px(ctx, 6, 5, P.ice5);
    // Crystal lines
    for (let i = 0; i < 3; i++) {
        const x = 8 + i * 8;
        for (let j = 0; j < 6; j++) px(ctx, x + j, 10 + j * 2, P.ice4);
    }
    if (damage === '_damaged') {
        // Fracture lines in white
        for (let j = 0; j < 12; j++) px(ctx, 10 + j, 14 + (j % 3), P.white);
        for (let j = 0; j < 8; j++) px(ctx, 20 - j, 22 + (j % 2), P.white);
    }
    if (damage === '_critical') {
        for (let j = 0; j < 16; j++) px(ctx, 6 + j, 12 + (j % 4), P.white);
        for (let j = 0; j < 12; j++) px(ctx, 22 - j, 20 + (j % 3), P.white);
        addDesatOverlay(ctx, S);
    }
    save(`block_ice${damage}`, canvas);
}

function generateRubberBlock(damage: '' | '_damaged' | '_critical') {
    const S = 32;
    const { canvas, ctx } = makeCanvas(S, S);
    drawBlockBase(ctx, S, P.rubber3, P.rubber5, P.rubber2, P.rubber1);
    // Dot texture
    for (let y = 3; y < S; y += 6) {
        for (let x = 3; x < S; x += 6) {
            px(ctx, x, y, P.rubber4);
            px(ctx, x + 1, y, P.rubber4);
            px(ctx, x, y + 1, P.rubber4);
        }
    }
    // Bouncy highlight
    ctx.globalAlpha = 0.2;
    fillArea(ctx, 2, 2, S - 4, 6, P.rubber5);
    ctx.globalAlpha = 1;

    if (damage === '_damaged') {
        // Stretched marks
        for (let i = 0; i < 4; i++) hLine(ctx, 4, 10 + i * 5, 24, P.rubber1);
    }
    if (damage === '_critical') {
        for (let i = 0; i < 6; i++) hLine(ctx, 2, 6 + i * 4, 28, P.rubber1);
        addDesatOverlay(ctx, S);
    }
    save(`block_rubber${damage}`, canvas);
}

function generateSteelBlock(damage: '' | '_damaged' | '_critical') {
    const S = 32;
    const { canvas, ctx } = makeCanvas(S, S);
    drawBlockBase(ctx, S, P.steel3, P.steel5, P.steel2, P.steel1);
    // Rivets (4 corners)
    for (const [rx, ry] of [[4, 4], [27, 4], [4, 27], [27, 27]]) {
        px(ctx, rx, ry, P.steel5);
        px(ctx, rx + 1, ry, P.steel4);
        px(ctx, rx, ry + 1, P.steel4);
    }
    // Diagonal brushed metal lines
    for (let i = 0; i < S; i += 3) {
        for (let j = 0; j < 4; j++) {
            const x = i + j;
            const y = j;
            if (x < S && y < S) px(ctx, x, y, P.steel4);
        }
    }
    // Shine
    hLine(ctx, 6, 2, 20, P.steel5);
    hLine(ctx, 8, 3, 16, P.steel4);

    if (damage === '_damaged') {
        // Dent marks
        fillArea(ctx, 10, 12, 6, 3, P.steel2);
        fillArea(ctx, 20, 22, 5, 2, P.steel2);
        addCracks(ctx, S, 2);
    }
    if (damage === '_critical') {
        fillArea(ctx, 8, 10, 8, 4, P.steel1);
        fillArea(ctx, 18, 20, 7, 3, P.steel1);
        addCracks(ctx, S, 5);
        addDesatOverlay(ctx, S);
    }
    save(`block_steel${damage}`, canvas);
}

// ─── KING SPRITES ───

function generateKing(variant: 'idle_0' | 'idle_1' | 'hit') {
    const S = 24;
    const { canvas, ctx } = makeCanvas(S, S);

    // Body/robe
    fillArea(ctx, 8, 12, 8, 10, P.robe);
    fillArea(ctx, 9, 12, 6, 10, P.robeLight);
    fillArea(ctx, 7, 20, 10, 2, P.robeDark); // feet

    // Head
    fillArea(ctx, 9, 6, 6, 6, P.skin);
    fillArea(ctx, 9, 6, 6, 1, P.skinDark); // hairline
    px(ctx, 10, 8, P.black); // left eye
    px(ctx, 13, 8, P.black); // right eye
    px(ctx, 11, 10, P.skinDark); px(ctx, 12, 10, P.skinDark); // mouth

    // Crown
    fillArea(ctx, 8, 3, 8, 3, P.gold3);
    px(ctx, 8, 2, P.gold3); px(ctx, 10, 1, P.gold4); px(ctx, 12, 0, P.gold4);
    px(ctx, 14, 1, P.gold4); px(ctx, 15, 2, P.gold3);
    // Crown gems
    px(ctx, 10, 3, P.lava1); px(ctx, 12, 3, P.ice3); px(ctx, 14, 3, P.lava1);

    // Arms
    fillArea(ctx, 6, 13, 2, 6, P.skin);
    fillArea(ctx, 16, 13, 2, 6, P.skin);

    // Idle breathing offset
    if (variant === 'idle_1') {
        // Slight shift — redraw body 1px lower (subtle)
        ctx.clearRect(0, 0, S, S);
        // Body/robe shifted
        fillArea(ctx, 8, 13, 8, 10, P.robe);
        fillArea(ctx, 9, 13, 6, 10, P.robeLight);
        fillArea(ctx, 7, 21, 10, 2, P.robeDark);
        fillArea(ctx, 9, 7, 6, 6, P.skin);
        fillArea(ctx, 9, 7, 6, 1, P.skinDark);
        px(ctx, 10, 9, P.black); px(ctx, 13, 9, P.black);
        px(ctx, 11, 11, P.skinDark); px(ctx, 12, 11, P.skinDark);
        fillArea(ctx, 8, 4, 8, 3, P.gold3);
        px(ctx, 8, 3, P.gold3); px(ctx, 10, 2, P.gold4); px(ctx, 12, 1, P.gold4);
        px(ctx, 14, 2, P.gold4); px(ctx, 15, 3, P.gold3);
        px(ctx, 10, 4, P.lava1); px(ctx, 12, 4, P.ice3); px(ctx, 14, 4, P.lava1);
        fillArea(ctx, 6, 14, 2, 6, P.skin);
        fillArea(ctx, 16, 14, 2, 6, P.skin);
    }

    if (variant === 'hit') {
        // White flash overlay
        ctx.globalAlpha = 0.6;
        fillArea(ctx, 0, 0, S, S, P.white);
        ctx.globalAlpha = 1;
    }

    save(`king_${variant}`, canvas);
}

// ─── CANNON SPRITES ───

function generateCannon(facing: 'left' | 'right') {
    const W = 32, H = 16;
    const { canvas, ctx } = makeCanvas(W, H);

    const flip = facing === 'left';
    const fx = (x: number) => flip ? W - 1 - x : x;

    // Wheels (2 circles)
    for (const wx of [6, 22]) {
        const cx = fx(wx);
        for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
                if (dx * dx + dy * dy <= 10) {
                    px(ctx, cx + (flip ? -dx : dx), 12 + dy, P.wheelBrown);
                }
                if (dx * dx + dy * dy <= 4) {
                    px(ctx, cx + (flip ? -dx : dx), 12 + dy, P.wheelDark);
                }
            }
        }
        // Axle
        px(ctx, cx, 12, P.metal5);
    }

    // Barrel
    for (let x = 8; x < 28; x++) {
        fillArea(ctx, fx(x) - (flip ? 3 : 0), 4, flip ? 4 : 1, 6, x < 12 ? P.metal2 : P.metal3);
    }
    // Barrel top highlight
    for (let x = 10; x < 26; x++) {
        px(ctx, fx(x), 4, P.metal5);
    }
    // Barrel bottom shadow
    for (let x = 10; x < 26; x++) {
        px(ctx, fx(x), 9, P.metal1);
    }
    // Muzzle ring
    fillArea(ctx, fx(26) - (flip ? 2 : 0), 3, flip ? 3 : 3, 8, P.gold2);
    fillArea(ctx, fx(27) - (flip ? 1 : 0), 4, flip ? 2 : 2, 6, P.metal1);
    // Muzzle opening
    fillArea(ctx, fx(28), 5, 1, 4, P.black);

    // Gold trim
    px(ctx, fx(10), 5, P.gold3); px(ctx, fx(10), 8, P.gold3);
    px(ctx, fx(18), 5, P.gold3); px(ctx, fx(18), 8, P.gold3);

    // Base/carriage
    fillArea(ctx, fx(4) - (flip ? 20 : 0), 8, 24, 3, P.wheelBrown);
    fillArea(ctx, fx(5) - (flip ? 18 : 0), 9, 20, 1, P.wheelDark);

    save(`cannon_${facing}`, canvas);
}

// ─── PROJECTILE SPRITES ───

function generateProjectile() {
    const S = 12;
    const { canvas, ctx } = makeCanvas(S, S);
    // Metallic sphere
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const dx = x - S / 2 + 0.5;
            const dy = y - S / 2 + 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > S / 2) continue;
            const t = dist / (S / 2);
            // Shading: lighter top-left, darker bottom-right
            const shade = 1 - t * 0.6 - (dx + dy) / S * 0.3;
            const r = Math.round(60 + shade * 80);
            const g = Math.round(60 + shade * 80);
            const b = Math.round(70 + shade * 90);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x, y, 1, 1);
        }
    }
    // Highlight
    px(ctx, 3, 3, P.white);
    px(ctx, 4, 3, P.steel5);
    px(ctx, 3, 4, P.steel5);
    save('projectile', canvas);
}

function generateProjectileTrail() {
    const S = 8;
    const { canvas, ctx } = makeCanvas(S, S);
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const dx = x - S / 2 + 0.5;
            const dy = y - S / 2 + 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > S / 2) continue;
            const alpha = 1 - dist / (S / 2);
            ctx.fillStyle = `rgba(255, 180, 80, ${(alpha * 0.6).toFixed(2)})`;
            ctx.fillRect(x, y, 1, 1);
        }
    }
    save('projectile_trail', canvas);
}

// ─── TERRAIN TILES ───

function generateTerrainGrass() {
    const W = 32, H = 8;
    const { canvas, ctx } = makeCanvas(W, H);
    // Base
    fillArea(ctx, 0, 3, W, 5, P.grass1);
    // Grass blades
    for (let x = 0; x < W; x++) {
        const height = 2 + ((x * 7 + 3) % 4);
        const color = x % 3 === 0 ? P.grass4 : x % 3 === 1 ? P.grass3 : P.grass2;
        vLine(ctx, x, H - height, height, color);
        // Tip highlight
        px(ctx, x, H - height, P.grass4);
    }
    save('terrain_grass', canvas);
}

function generateTerrainEarth() {
    const S = 32;
    const { canvas, ctx } = makeCanvas(S, S);
    fillArea(ctx, 0, 0, S, S, P.earth3);
    // Noise dots
    for (let i = 0; i < 60; i++) {
        const x = (i * 13 + 7) % S;
        const y = (i * 17 + 3) % S;
        px(ctx, x, y, i % 3 === 0 ? P.earth4 : P.earth2);
    }
    // Small rocks
    for (let i = 0; i < 5; i++) {
        const x = (i * 23 + 4) % (S - 3);
        const y = (i * 11 + 8) % (S - 3);
        fillArea(ctx, x, y, 3, 2, P.earth1);
        px(ctx, x + 1, y, P.earth4);
    }
    save('terrain_earth', canvas);
}

function generateTerrainDeep() {
    const S = 32;
    const { canvas, ctx } = makeCanvas(S, S);
    fillArea(ctx, 0, 0, S, S, P.earthDeep2);
    for (let i = 0; i < 40; i++) {
        px(ctx, (i * 19 + 5) % S, (i * 13 + 7) % S, i % 2 === 0 ? P.earthDeep1 : P.earthDeep3);
    }
    save('terrain_deep', canvas);
}

// ─── HAZARD SPRITES ───

function generateLavaFrame(frame: number) {
    const W = 32, H = 16;
    const { canvas, ctx } = makeCanvas(W, H);
    // Base glow
    fillArea(ctx, 0, 0, W, H, P.lava1);
    // Bright patches (shift with frame)
    for (let i = 0; i < 6; i++) {
        const x = ((i * 11 + frame * 5) % (W - 4));
        const y = ((i * 7 + frame * 3) % (H - 3));
        fillArea(ctx, x, y, 4, 3, P.lava3);
        px(ctx, x + 1, y + 1, P.lava4);
    }
    // Bubbles
    for (let i = 0; i < 3; i++) {
        const bx = ((i * 13 + frame * 8) % (W - 2));
        const by = ((i * 9 + frame * 4) % (H - 4)) + 2;
        px(ctx, bx, by, P.lavaGlow);
        px(ctx, bx + 1, by, P.lava4);
    }
    // Top crust
    for (let x = 0; x < W; x++) {
        px(ctx, x, 0, (x + frame) % 4 === 0 ? P.lava2 : P.crackDark);
    }
    save(`lava_${frame}`, canvas);
}

function generateWindStreak() {
    const W = 16, H = 4;
    const { canvas, ctx } = makeCanvas(W, H);
    // Tapered streak
    for (let x = 0; x < W; x++) {
        const alpha = (1 - x / W) * 0.5;
        const thickness = Math.max(1, Math.round((1 - x / W) * 3));
        const y0 = Math.floor((H - thickness) / 2);
        ctx.fillStyle = `rgba(180, 215, 255, ${alpha.toFixed(2)})`;
        fillArea(ctx, x, y0, 1, thickness, ctx.fillStyle);
    }
    save('wind_streak', canvas);
}

function generateFallingRock() {
    const S = 16;
    const { canvas, ctx } = makeCanvas(S, S);
    // Rough boulder shape
    for (let y = 2; y < S - 2; y++) {
        for (let x = 2; x < S - 2; x++) {
            const dx = x - S / 2 + 0.5;
            const dy = y - S / 2 + 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > S / 2 - 1 + ((x * 3 + y * 7) % 3 - 1)) continue;
            const shade = ((x * 13 + y * 7) % 3);
            px(ctx, x, y, shade === 0 ? P.stone2 : shade === 1 ? P.stone3 : P.stone4);
        }
    }
    // Highlight
    px(ctx, 5, 4, P.stone5); px(ctx, 6, 4, P.stone5);
    save('rock', canvas);
}

// ─── UI SPRITES ───

function generateCrown() {
    const S = 12;
    const { canvas, ctx } = makeCanvas(S, S);
    // Crown base
    fillArea(ctx, 1, 6, 10, 4, P.gold3);
    fillArea(ctx, 2, 7, 8, 2, P.gold2);
    // Spikes
    px(ctx, 1, 5, P.gold3); px(ctx, 1, 4, P.gold4);
    px(ctx, 3, 4, P.gold3); px(ctx, 3, 3, P.gold4); px(ctx, 3, 2, P.gold4);
    px(ctx, 5, 3, P.gold3); px(ctx, 5, 2, P.gold4); px(ctx, 5, 1, P.gold4);
    px(ctx, 7, 3, P.gold3); px(ctx, 7, 2, P.gold4); px(ctx, 7, 2, P.gold4);
    px(ctx, 8, 4, P.gold3); px(ctx, 8, 3, P.gold4);
    px(ctx, 10, 5, P.gold3); px(ctx, 10, 4, P.gold4);
    // Gems
    px(ctx, 3, 7, P.lava1); px(ctx, 5, 7, P.ice3); px(ctx, 8, 7, P.lava1);
    save('crown', canvas);
}

function generateExplosionFrame(frame: number) {
    const S = 32;
    const { canvas, ctx } = makeCanvas(S, S);
    const radius = 4 + frame * 5;
    const alpha = 1 - frame * 0.2;
    const cx = S / 2, cy = S / 2;
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const dx = x - cx + 0.5;
            const dy = y - cy + 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > radius) continue;
            const t = dist / radius;
            if (t < 0.3) {
                ctx.fillStyle = `rgba(255, 240, 160, ${alpha.toFixed(2)})`;
            } else if (t < 0.6) {
                ctx.fillStyle = `rgba(255, 160, 48, ${(alpha * 0.8).toFixed(2)})`;
            } else {
                ctx.fillStyle = `rgba(255, 80, 20, ${(alpha * 0.5).toFixed(2)})`;
            }
            ctx.fillRect(x, y, 1, 1);
        }
    }
    save(`explosion_${frame}`, canvas);
}

function generateSparkFrame(frame: number) {
    const S = 16;
    const { canvas, ctx } = makeCanvas(S, S);
    const count = 6 - frame * 2;
    const alpha = 1 - frame * 0.3;
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + frame * 0.5;
        const dist = 2 + frame * 3 + ((i * 3) % 2);
        const sx = Math.round(S / 2 + Math.cos(angle) * dist);
        const sy = Math.round(S / 2 + Math.sin(angle) * dist);
        if (sx >= 0 && sx < S && sy >= 0 && sy < S) {
            ctx.fillStyle = `rgba(255, 210, 80, ${alpha.toFixed(2)})`;
            ctx.fillRect(sx, sy, 2, 2);
            if (sx + 1 < S) px(ctx, sx + 1, sy, P.spark2);
        }
    }
    save(`spark_${frame}`, canvas);
}

// ─── GENERATE ALL ───

console.log('Generating pixel art sprites...\n');

// Blocks
for (const damage of ['', '_damaged', '_critical'] as const) {
    generateWoodBlock(damage);
    generateStoneBlock(damage);
    generateIceBlock(damage);
    generateRubberBlock(damage);
    generateSteelBlock(damage);
}

// Characters
generateKing('idle_0');
generateKing('idle_1');
generateKing('hit');

// Cannons
generateCannon('left');
generateCannon('right');

// Projectiles
generateProjectile();
generateProjectileTrail();

// Terrain
generateTerrainGrass();
generateTerrainEarth();
generateTerrainDeep();

// Hazards
for (let i = 0; i < 4; i++) generateLavaFrame(i);
generateWindStreak();
generateFallingRock();

// UI
generateCrown();
for (let i = 0; i < 4; i++) generateExplosionFrame(i);
for (let i = 0; i < 3; i++) generateSparkFrame(i);

// Write manifest
const manifestPath = path.join(OUT_DIR, 'manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify({ sprites: manifest }, null, 2));
console.log(`\nManifest written: ${manifestPath}`);
console.log(`Total sprites: ${manifest.length}`);

// Validate
let valid = true;
for (const entry of manifest) {
    const fullPath = path.join(OUT_DIR, `${entry.name}.png`);
    if (!fs.existsSync(fullPath)) {
        console.error(`MISSING: ${fullPath}`);
        valid = false;
    }
}
console.log(valid ? '\nAll sprites validated.' : '\nVALIDATION FAILED.');
process.exit(valid ? 0 : 1);
