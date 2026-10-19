import type { BodyState, GameState, KingHpState, Side, TerrainData, Vector } from '../types';
import { WORLD_WIDTH } from '../types';
import { cartoon } from '../sprites/cartoon';
import type { ParticleSystem } from '../effects/particles';
import { minimapRect, worldToScreen, type Viewport } from './viewport';
import { cannonPosition, terrainHeight } from './ballistics';
import { canPlace } from './placement';

export interface BattleHazard {
    type: string;
    id: string;
    position: Vector;
    width: number;
    height: number;
    windDirection?: number;
    windStrength?: number;
}

export interface BattleEffect { x: number; y: number; at: number; kind: 'impact' | 'break' | 'damage'; damage?: number }
export interface BattleFrame {
    view: Viewport;
    camera: number;
    now: number;
    reducedMotion: boolean;
    state: GameState | null;
    terrain: TerrainData | null;
    previous: Map<number, { x: number; y: number; angle: number }>;
    interpolation: number;
    kings: { left: KingHpState; right: KingHpState };
    names?: { left: string; right: string };
    side: Side;
    phase: string;
    turn: Side | null;
    angle: number;
    trajectory: Vector[];
    hazards: BattleHazard[];
    effects: BattleEffect[];
    particles: ParticleSystem;
    shot?: { side: Side; at: number };
    ghost?: Vector;
    projectileId?: number | null;
    placementDimensions: readonly [number, number];
}

const MATERIALS: Record<string, [string, string, string]> = {
    wood: ['#edbd6a', '#a96d2e', '#684b30'],
    stone: ['#c8d9de', '#849da9', '#4c6571'],
    ice: ['#e5ffff', '#7edcde', '#3693ae'],
    rubber: ['#f8a2c5', '#de639b', '#9d3d7a'],
    steel: ['#c9dbe9', '#7892ab', '#3c576e'],
    foundation: ['#e5e4ce', '#a8b3a8', '#65736b'],
};

function pathTerrain(ctx: CanvasRenderingContext2D, points: Vector[]) {
    ctx.beginPath();
    ctx.moveTo(-100, 660);
    ctx.lineTo(-100, points[0]?.y ?? 520);
    for (const p of points) ctx.lineTo(p.x, p.y);
    ctx.lineTo(WORLD_WIDTH + 100, points.at(-1)?.y ?? 520);
    ctx.lineTo(WORLD_WIDTH + 100, 660);
    ctx.closePath();
}

let ridgeCache: { image: HTMLImageElement; y: number } | undefined;
function backgroundRidge(image: HTMLImageElement) {
    if (ridgeCache?.image === image) return ridgeCache.y;
    const buffer = document.createElement('canvas');
    buffer.width = image.width;
    buffer.height = image.height;
    const ctx = buffer.getContext('2d', { willReadFrequently: true });
    if (!ctx) return image.height * 0.6;
    ctx.drawImage(image, 0, 0);
    const x = Math.floor(image.width * 0.63);
    const pixels = ctx.getImageData(x, 0, 1, image.height).data;
    let y = 0;
    while (y < image.height && pixels[y * 4 + 3] < 160) y++;
    ridgeCache = { image, y };
    return y;
}

function backdrop(ctx: CanvasRenderingContext2D, f: BattleFrame) {
    const { width, height } = f.view;
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#76c7ed');
    sky.addColorStop(0.72, '#c5e9ef');
    sky.addColorStop(1, '#e2f0d3');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 5; i++) {
        const drift = f.reducedMotion ? 0 : f.now * (0.0015 + i * 0.0002);
        const x = ((i * 317 + 90 + drift - f.camera * 0.06) % (width + 240) + width + 240) % (width + 240) - 120;
        const y = 75 + (i % 3) * 35;
        ctx.beginPath();
        ctx.ellipse(x, y, 66, 15, 0, 0, Math.PI * 2);
        ctx.ellipse(x - 22, y - 9, 28, 20, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 12, y - 14, 33, 25, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    const hills = cartoon.get('far_hills');
    const fortress = cartoon.get('distant_fortress');
    if (hills) {
        const w = Math.max(960, width * 1.25, height * 3.7);
        const h = w / 3;
        const x = width * 0.72 - w * 0.63 - f.camera * 0.035;
        const y = height * 0.49 - backgroundRidge(hills) * h / hills.height;
        if (fortress) {
            const fw = Math.min(180, Math.max(112, width * 0.15));
            const meta = cartoon.metadata('distant_fortress');
            const s = fw / fortress.width;
            const baseline = y + backgroundRidge(hills) * h / hills.height + 7;
            ctx.globalAlpha = 0.8;
            ctx.drawImage(fortress, x + w * 0.63 - meta.pivot.x * s, baseline - meta.pivot.y * s, fw, fortress.height * s);
            ctx.globalAlpha = 1;
        }
        // Both layers use the same camera transform. The ridge occludes the castle foot.
        ctx.drawImage(hills, x, y, w, h);
    }
}

function terrain(ctx: CanvasRenderingContext2D, f: BattleFrame) {
    const points = f.terrain?.points ?? [{ x: 0, y: 520 }, { x: WORLD_WIDTH, y: 520 }];
    const soil = ctx.createLinearGradient(0, 470, 0, 620);
    soil.addColorStop(0, '#c69b67');
    soil.addColorStop(0.35, '#a17c56');
    soil.addColorStop(1, '#735d4a');
    pathTerrain(ctx, points);
    ctx.fillStyle = soil;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(67,51,37,0.16)';
    const start = Math.max(-80, Math.floor(f.camera / 46) * 46);
    for (let x = start; x < Math.min(WORLD_WIDTH + 80, f.camera + f.view.worldWidth + 50); x += 46) {
        for (let y = 495; y < 650; y += 35) {
            const offset = (y % 3) * 7;
            ctx.beginPath();
            ctx.ellipse(x + offset, y, 3 + Math.abs(x % 5), 2, 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();

    // One continuous contour, rather than framed blocks repeated across the ground.
    ctx.beginPath();
    ctx.moveTo(-100, points[0].y);
    for (const p of points) ctx.lineTo(p.x, p.y);
    ctx.lineTo(WORLD_WIDTH + 100, points.at(-1)!.y);
    ctx.strokeStyle = '#416d39';
    ctx.lineWidth = 12;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.strokeStyle = '#82b94a';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = '#bdde70';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (f.phase === 'build') {
        const zone = f.terrain?.buildZones.find(z => f.side === 'left' ? z.x < WORLD_WIDTH / 2 : z.x >= WORLD_WIDTH / 2);
        if (zone) {
            ctx.save();
            ctx.fillStyle = 'rgba(33,167,148,0.055)';
            ctx.fillRect(zone.x, 110, zone.width, zone.y - 110);
            ctx.setLineDash([8, 8]);
            ctx.strokeStyle = 'rgba(28,107,107,0.35)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(zone.x, 110, zone.width, zone.y - 110);
            ctx.restore();
        }
    }
}

function hazards(ctx: CanvasRenderingContext2D, f: BattleFrame) {
    for (const hazard of f.hazards) {
        const { x, y } = hazard.position;
        if (hazard.type === 'lava_pool') {
            const w = hazard.width;
            const lavaY = terrainHeight(f.terrain?.points ?? [], x);
            ctx.fillStyle = '#cc4d40';
            ctx.fillRect(x, lavaY - 3, w, 13);
            ctx.strokeStyle = '#ffe08c';
            ctx.lineWidth = 3;
            ctx.beginPath();
            for (let i = 0; i <= w; i += 4) {
                const py = lavaY + Math.sin(i * 0.12 + (f.reducedMotion ? 0 : f.now * 0.004)) * 2;
                if (i === 0) ctx.moveTo(x + i, py); else ctx.lineTo(x + i, py);
            }
            ctx.stroke();
        } else if (hazard.type === 'wind_zone') {
            ctx.save();
            ctx.strokeStyle = 'rgba(39,106,137,0.38)';
            ctx.lineWidth = 2;
            const dir = hazard.windDirection ?? 1;
            for (let i = 0; i < 4; i++) {
                const cycle = f.reducedMotion ? 0.5 : (f.now * 0.00015 + i * 0.21) % 1;
                const ax = x + cycle * hazard.width;
                const ay = y + 190 + i * 58;
                ctx.beginPath();
                ctx.moveTo(ax - 20 * dir, ay);
                ctx.lineTo(ax + 12 * dir, ay);
                ctx.lineTo(ax + 7 * dir, ay - 4);
                ctx.moveTo(ax + 12 * dir, ay);
                ctx.lineTo(ax + 7 * dir, ay + 4);
                ctx.stroke();
            }
            ctx.restore();
        } else if (hazard.type === 'falling_rocks') {
            ctx.save();
            ctx.setLineDash([4, 9]);
            ctx.strokeStyle = 'rgba(168,100,55,0.3)';
            ctx.lineWidth = 1;
            for (const edge of [x, x + hazard.width]) {
                ctx.beginPath(); ctx.moveTo(edge, 80); ctx.lineTo(edge, 600); ctx.stroke();
            }
            ctx.restore();
        }
    }
}

function cannon(ctx: CanvasRenderingContext2D, f: BattleFrame, side: Side) {
    const pos = cannonPosition(side, f.terrain?.points ?? []);
    const angle = side === f.side ? f.angle : Math.PI / 4;
    const facing = side === 'left' ? 1 : -1;
    const base = cartoon.get('cannon_base');
    const barrel = cartoon.get('cannon_barrel');
    const kickAge = f.shot?.side === side ? f.now - f.shot.at : 1000;
    const kick = f.reducedMotion ? 0 : Math.max(0, 1 - kickAge / 240) * 5;
    ctx.save();
    ctx.translate(pos.x, pos.y - 9);
    ctx.scale(facing, 1);
    if (base && barrel) {
        const baseScale = 78 / base.width;
        const barrelScale = 105 / barrel.width;
        const bp = cartoon.metadata('cannon_base').pivot;
        const rp = cartoon.metadata('cannon_barrel').pivot;
        ctx.save();
        ctx.rotate(-angle);
        ctx.drawImage(barrel, -rp.x * barrelScale - kick, -rp.y * barrelScale, barrel.width * barrelScale, barrel.height * barrelScale);
        ctx.restore();
        ctx.drawImage(base, -bp.x * baseScale, -bp.y * baseScale, base.width * baseScale, base.height * baseScale);
    } else {
        ctx.fillStyle = '#b37e3d';
        ctx.fillRect(-28, 5, 45, 14);
        ctx.save();
        ctx.rotate(-angle);
        ctx.fillStyle = '#476b86';
        ctx.fillRect(-9, -9, 45, 18);
        ctx.restore();
        ctx.fillStyle = '#4c5c67';
        for (const x of [-20, 11]) { ctx.beginPath(); ctx.arc(x, 20, 10, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
}

function block(ctx: CanvasRenderingContext2D, b: BodyState) {
    const w = b.width || 40;
    const h = b.height || 40;
    const mat = b.label === 'foundation' ? 'foundation' : b.material || b.label;
    const [light, fill, dark] = MATERIALS[mat] ?? MATERIALS.stone;
    const texture = mat === 'wood' ? cartoon.get('wood_surface') : undefined;
    if (texture) ctx.drawImage(texture, -w / 2, -h / 2, w, h);
    else {
        const gradient = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
        gradient.addColorStop(0, light);
        gradient.addColorStop(0.2, fill);
        gradient.addColorStop(1, dark);
        ctx.fillStyle = gradient;
        ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.26)';
    ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, 2);
    if (mat === 'steel') {
        ctx.fillStyle = light;
        for (const x of [-w / 2 + 5, w / 2 - 5]) for (const y of [-h / 2 + 5, h / 2 - 5]) {
            ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
        }
    } else if (mat === 'ice') {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.moveTo(-w * 0.3, h * 0.35); ctx.lineTo(w * 0.3, -h * 0.35); ctx.stroke();
    }
    const ratio = b.blockMaxHp ? (b.blockHp ?? b.blockMaxHp) / b.blockMaxHp : 1;
    if (ratio < 0.67) {
        ctx.strokeStyle = dark;
        ctx.lineWidth = ratio < 0.34 ? 2.5 : 1.5;
        ctx.beginPath(); ctx.moveTo(-w * 0.18, -h / 2); ctx.lineTo(w * 0.08, -h * 0.08);
        ctx.lineTo(-w * 0.06, h * 0.12); ctx.lineTo(w * 0.2, h / 2); ctx.stroke();
    }
}

function entities(ctx: CanvasRenderingContext2D, f: BattleFrame) {
    for (const b of f.state?.bodies ?? []) {
        if (b.isStatic && b.label !== 'foundation') continue;
        const old = f.previous.get(b.id);
        const t = f.interpolation;
        const x = old ? old.x + (b.position.x - old.x) * t : b.position.x;
        const y = old ? old.y + (b.position.y - old.y) * t : b.position.y;
        if (x < f.camera - 100 || x > f.camera + f.view.worldWidth + 100) continue;
        const delta = old ? Math.atan2(Math.sin(b.angle - old.angle), Math.cos(b.angle - old.angle)) : 0;
        const angle = old ? old.angle + delta * t : b.angle;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        if (b.label === 'king') {
            const king = cartoon.get('king');
            const kingSide = Math.abs(x - (f.kings.left.x ?? 300)) < Math.abs(x - (f.kings.right.x ?? 2100)) ? 'left' : 'right';
            const facing = kingSide === 'left' ? 1 : -1;
            const radius = b.circleRadius || 16;
            const breath = f.reducedMotion ? 1 : 1 + Math.sin(f.now * 0.0025) * 0.008;
            ctx.fillStyle = 'rgba(39,59,54,0.14)';
            ctx.beginPath(); ctx.ellipse(0, radius + 1, 19, 4, 0, 0, Math.PI * 2); ctx.fill();
            if (king) {
                const scale = 70 / king.height;
                const pivot = cartoon.metadata('king').pivot;
                ctx.translate(0, radius);
                ctx.scale(facing, breath);
                ctx.drawImage(king, -pivot.x * scale, -pivot.y * scale, king.width * scale, king.height * scale);
            } else {
                ctx.fillStyle = '#efb949';
                ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
            }
        } else if (b.label === 'projectile' || b.circleRadius) {
            const radius = b.circleRadius || 9;
            if (b.label === 'projectile') {
                const length = Math.min(32, Math.hypot(b.velocity.x, b.velocity.y));
                const direction = Math.atan2(b.velocity.y, b.velocity.x) - angle;
                ctx.strokeStyle = 'rgba(255,255,255,0.75)';
                ctx.lineWidth = 5;
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-Math.cos(direction) * length, -Math.sin(direction) * length); ctx.stroke();
            }
            ctx.fillStyle = b.label === 'projectile' ? '#314a60' : '#8c9a9a';
            ctx.strokeStyle = '#f4e2b1'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#c4dde5';
            ctx.beginPath(); ctx.arc(-radius * 0.28, -radius * 0.3, radius * 0.25, 0, Math.PI * 2); ctx.fill();
        } else block(ctx, b);
        ctx.restore();
    }
}

function health(ctx: CanvasRenderingContext2D, f: BattleFrame, side: Side) {
    const width = Math.min(188, (f.view.width - 30) / 2);
    const x = side === 'left' ? 10 : f.view.width - width - 10;
    const king = f.kings[side];
    ctx.fillStyle = 'rgba(249,253,248,0.91)';
    ctx.strokeStyle = side === 'left' ? '#3f8e9c' : '#be6c66';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, 10, width, 44, 6); ctx.fill(); ctx.stroke();
    ctx.font = '600 12px system-ui';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#26434b';
    let name = f.names?.[side] || (side === f.side ? 'You' : 'Opponent');
    while (ctx.measureText(name).width > width - 68 && name.length > 1) name = name.slice(0, -2) + '\u2026';
    ctx.fillText(name, x + 8, 27);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.max(0, Math.ceil(king.hp))}`, x + width - 8, 27);
    ctx.fillStyle = '#d8e5dc';
    ctx.fillRect(x + 8, 34, width - 16, 10);
    ctx.fillStyle = side === 'left' ? '#31a98a' : '#df7b69';
    ctx.fillRect(x + 8, 34, (width - 16) * Math.max(0, Math.min(1, king.hp / Math.max(1, king.maxHp))), 10);
}

function minimap(ctx: CanvasRenderingContext2D, f: BattleFrame) {
    const box = minimapRect(f.view);
    ctx.save();
    ctx.fillStyle = 'rgba(245,252,244,0.88)';
    ctx.strokeStyle = 'rgba(57,95,89,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(box.x, box.y, box.width, box.height, 4); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.rect(box.x, box.y, box.width, box.height); ctx.clip();
    const sx = box.width / WORLD_WIDTH;
    const sy = box.height / 600;
    ctx.beginPath(); ctx.moveTo(box.x, box.y + box.height);
    for (const p of f.terrain?.points ?? []) ctx.lineTo(box.x + p.x * sx, box.y + p.y * sy);
    ctx.lineTo(box.x + box.width, box.y + box.height); ctx.closePath();
    ctx.fillStyle = '#88aa6b'; ctx.fill();
    for (const b of f.state?.bodies ?? []) {
        if (b.isStatic) continue;
        ctx.fillStyle = b.label === 'king' ? '#d68926' : b.label === 'projectile' ? '#d64c48' : '#51748b';
        ctx.fillRect(box.x + b.position.x * sx - 1, box.y + b.position.y * sy - 2, b.label === 'king' ? 4 : 2, 3);
    }
    ctx.strokeStyle = '#2c778d';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(box.x + f.camera * sx, box.y + 1, f.view.worldWidth * sx, box.height - 2);
    ctx.restore();
}

export function drawBattle(ctx: CanvasRenderingContext2D, f: BattleFrame) {
    backdrop(ctx, f);
    const { scale, top } = f.view;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-f.camera, -top);
    terrain(ctx, f);
    hazards(ctx, f);
    cannon(ctx, f, 'left'); cannon(ctx, f, 'right');
    if (f.trajectory.length && f.phase === 'combat' && f.turn === f.side) {
        ctx.save();
        ctx.setLineDash([2, 11]);
        ctx.lineCap = 'round';
        ctx.lineWidth = 3 / scale;
        ctx.strokeStyle = 'rgba(35,89,117,0.55)';
        ctx.beginPath();
        f.trajectory.forEach((p, i) => { if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }
    entities(ctx, f);
    if (f.ghost && f.phase === 'build') {
        const valid = canPlace(f.ghost, f.side);
        const [width, height] = f.placementDimensions;
        ctx.fillStyle = valid ? 'rgba(43,140,133,0.22)' : 'rgba(206,77,62,0.25)';
        ctx.strokeStyle = valid ? '#267e78' : '#b74b3d'; ctx.lineWidth = 2;
        ctx.fillRect(f.ghost.x - width / 2, f.ghost.y - height / 2, width, height);
        ctx.strokeRect(f.ghost.x - width / 2, f.ghost.y - height / 2, width, height);
    }
    f.particles.draw(ctx, f.camera, f.view.worldWidth);
    for (const effect of f.effects) {
        const age = Math.min(1, (f.now - effect.at) / (effect.kind === 'damage' ? 950 : 420));
        ctx.save();
        ctx.globalAlpha = 1 - age;
        if (effect.kind === 'damage') {
            ctx.font = 'bold 21px system-ui'; ctx.textAlign = 'center';
            ctx.lineWidth = 4; ctx.strokeStyle = '#fffaf0'; ctx.fillStyle = '#bb4445';
            const text = `-${effect.damage}`;
            const y = effect.y - 35 - age * (f.reducedMotion ? 0 : 30);
            ctx.strokeText(text, effect.x, y); ctx.fillText(text, effect.x, y);
        } else {
            ctx.strokeStyle = effect.kind === 'break' ? '#ffc56b' : '#fff5bc';
            ctx.lineWidth = 5 * (1 - age);
            ctx.beginPath(); ctx.arc(effect.x, effect.y, 8 + age * (f.reducedMotion ? 4 : 32), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
    }
    ctx.restore();
    health(ctx, f, 'left'); health(ctx, f, 'right'); minimap(ctx, f);
    const projectile = f.state?.bodies.find(b => b.id === f.projectileId);
    if (projectile) {
        const point = worldToScreen(projectile.position, f.camera, f.view);
        if (point.y < 65) {
            const x = Math.max(16, Math.min(f.view.width - 16, point.x));
            ctx.fillStyle = '#325773';
            ctx.beginPath(); ctx.moveTo(x, 65); ctx.lineTo(x - 6, 73); ctx.lineTo(x + 6, 73); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.arc(x, 83, 5, 0, Math.PI * 2); ctx.fill();
        }
    }
}
