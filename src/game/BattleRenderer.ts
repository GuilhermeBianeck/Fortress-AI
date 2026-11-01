import type { BodyState, GameState, KingHpState, MatchPhase, Side, TerrainData, Vector } from '../types';
import { WORLD_WIDTH } from '../types';
import { cartoon } from '../sprites/cartoon';
import type { ParticleSystem } from '../effects/particles';
import { minimapRect, showBattleMinimap, worldToScreen, type Viewport } from './viewport';
import { SHOT_FLIGHT_RATE } from '../../server/shared/shotPacing';
import { cannonPosition, terrainHeight } from './ballistics';
import { canPlace } from './placement';
import { kingPresentation } from './kingAnimation';
import { kingReactions } from '../sprites/kingReactions';
import { drawLivingKing } from './livingKing';
import type { KingActionPose } from './kingActions';
import { CANNON_ART, MUZZLE_LOCAL } from './cannonPresentation';
import { battleArt, type BattleArtName } from '../sprites/battleArt';
import { gradeBackgroundPixels, groundTextureColumn, healthPanel, sceneryPlacement } from './battlePresentation';
import { renderedPosition, type RenderTransform } from './snapshotInterpolation';
import { hitFeedback, layoutHitFeedback, type BattleEffect } from './combatFeedback';
export type { BattleEffect } from './combatFeedback';

export interface BattleHazard {
    type: string;
    id: string;
    position: Vector;
    width: number;
    height: number;
    windDirection?: number;
    windStrength?: number;
}

export interface BattleFrame {
    view: Viewport;
    camera: number;
    now: number;
    reducedMotion: boolean;
    state: GameState | null;
    terrain: TerrainData | null;
    transforms: ReadonlyMap<number, RenderTransform>;
    kings: { left: KingHpState; right: KingHpState };
    names?: { left: string; right: string };
    side: Side;
    phase: MatchPhase;
    winner?: Side | null;
    turn: Side | null;
    angle: number;
    opponentAngle?: number;
    trajectory: Vector[];
    hazards: BattleHazard[];
    effects: BattleEffect[];
    particles: ParticleSystem;
    shot?: { side: Side; at: number; angle: number };
    ghost?: Vector;
    projectileId?: number | null;
    kingActions?: Partial<Record<Side, KingActionPose>>;
    placementDimensions: readonly [number, number];
    hitLabels?: boolean;
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

const atmosphereCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
function atmosphere(image: HTMLImageElement) {
    const cached = atmosphereCache.get(image);
    if (cached) return cached;
    const graded = document.createElement('canvas');
    graded.width = image.width; graded.height = image.height;
    const paint = graded.getContext('2d', { willReadFrequently: true })!;
    paint.drawImage(image, 0, 0);
    const pixels = paint.getImageData(0, 0, graded.width, graded.height);
    gradeBackgroundPixels(pixels.data);
    paint.putImageData(pixels, 0, 0);
    const output = document.createElement('canvas');
    output.width = graded.width; output.height = graded.height;
    const soft = output.getContext('2d')!;
    soft.filter = 'blur(1.6px)';
    soft.drawImage(graded, 0, 0);
    atmosphereCache.set(image, output);
    return output;
}

function backdrop(ctx: CanvasRenderingContext2D, f: BattleFrame) {
    const { width, height } = f.view;
    ctx.fillStyle = '#a6ccd9';
    ctx.fillRect(0, 0, width, height);
    const sky = battleArt.get('sky');
    if (sky) {
        const s = Math.max(width / sky.width, height / sky.height);
        ctx.drawImage(atmosphere(sky), (width - sky.width * s) / 2 - 3, (height - sky.height * s) / 2 - 3, sky.width * s + 6, sky.height * s + 6);
    }
    const cloud = battleArt.get('cloud');
    if (cloud) {
        for (let i = 0; i < 3; i++) {
            const w = Math.max(160, width * (0.19 + i * 0.035));
            const drift = f.reducedMotion ? 0 : f.now * (0.002 + i * 0.0005);
            const span = width + w * 2;
            const x = ((width * (i * 0.42 + 0.1) + drift - (f.reducedMotion ? 0 : f.camera * 0.04)) % span + span) % span - w;
            ctx.globalAlpha = 0.6;
            ctx.drawImage(atmosphere(cloud), x, height * (0.1 + i * 0.065), w, w * cloud.height / cloud.width);
        }
        ctx.globalAlpha = 1;
    }
    const valley = battleArt.get('valley');
    if (valley) {
        const art = sceneryPlacement(width, height, valley.width, valley.height, f.reducedMotion ? 600 : f.camera);
        ctx.drawImage(atmosphere(valley), art.x, art.y, art.width, art.height);
    }
}

const patterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();
function texture(ctx: CanvasRenderingContext2D, name: BattleArtName | 'wood', width: number, height?: number) {
    const image = name === 'wood' ? cartoon.get('wood_surface') : battleArt.get(name);
    if (!image) return undefined;
    let cache = patterns.get(ctx);
    if (!cache) { cache = new Map(); patterns.set(ctx, cache); }
    const key = `${name}:${width}:${height}`;
    if (!cache.has(key)) {
        const pattern = ctx.createPattern(image, 'repeat');
        if (pattern) { pattern.setTransform(new DOMMatrix().scale(width / image.width, (height ?? width * image.height / image.width) / image.height)); cache.set(key, pattern); }
    }
    return cache.get(key);
}

function terrain(ctx: CanvasRenderingContext2D, f: BattleFrame) {
    const points = f.terrain?.points ?? [{ x: 0, y: 520 }, { x: WORLD_WIDTH, y: 520 }];
    const soil = ctx.createLinearGradient(0, 470, 0, 620);
    soil.addColorStop(0, '#c69b67');
    soil.addColorStop(0.35, '#a17c56');
    soil.addColorStop(1, '#735d4a');
    pathTerrain(ctx, points);
    ctx.fillStyle = texture(ctx, 'earth', 430, 160) ?? soil;
    ctx.fill();

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

    const grass = battleArt.get('grass');
    if (grass) {
        // Small overlapping quads follow the real terrain without framed tiles or collider changes.
        const begin = Math.max(-80, Math.floor((f.camera - 8) / 4) * 4);
        const end = Math.min(WORLD_WIDTH + 80, f.camera + f.view.worldWidth + 8);
        const height = 360 * grass.height / grass.width;
        for (let x = begin; x < end; x += 4) {
            const y = terrainHeight(points, x), next = terrainHeight(points, x + 4);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.atan2(next - y, 4));
            const sx = groundTextureColumn(x) * grass.width;
            ctx.drawImage(grass, sx, 0, Math.min(grass.width - sx, grass.width * 4 / 360 + 1), grass.height,
                -0.5, -height * 0.15, Math.hypot(4, next - y) + 1, height);
            ctx.restore();
        }
    }

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
    const pos = cannonPosition(side, f.terrain?.points ?? [], f.terrain?.cannons);
    const angle = side === f.side ? f.angle : f.opponentAngle ?? (f.shot?.side === side ? f.shot.angle : Math.PI / 4);
    const facing = side === 'left' ? 1 : -1;
    const base = cartoon.get('cannon_base');
    const barrel = cartoon.get('cannon_barrel');
    const kickAge = f.shot?.side === side ? f.now - f.shot.at : 1000;
    const kick = f.reducedMotion ? 0 : Math.max(0, 1 - kickAge / 240) * 5;
    ctx.save();
    ctx.translate(pos.x, pos.y + CANNON_ART.originY);
    ctx.scale(facing, 1);
    if (base && barrel) {
        const baseScale = CANNON_ART.baseWidth / base.width;
        const barrelScale = CANNON_ART.barrelWidth / barrel.width;
        const bp = cartoon.metadata('cannon_base').pivot;
        const rp = cartoon.metadata('cannon_barrel').pivot;
        ctx.save();
        ctx.rotate(-angle);
        ctx.drawImage(barrel, -rp.x * barrelScale - kick, -rp.y * barrelScale, barrel.width * barrelScale, barrel.height * barrelScale);
        if (!f.reducedMotion && kickAge >= 0 && kickAge < 130) {
            const pulse = Math.sin(Math.PI * kickAge / 130);
            ctx.save();
            ctx.translate(MUZZLE_LOCAL.x - kick, MUZZLE_LOCAL.y);
            ctx.scale(0.65 + pulse * 0.6, 0.8 + pulse * 0.3);
            ctx.globalAlpha = 1 - kickAge / 150;
            ctx.fillStyle = '#ffbe48'; ctx.strokeStyle = '#e78836'; ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(-3, -5); ctx.lineTo(8, -5); ctx.lineTo(14, -12); ctx.lineTo(19, -5);
            ctx.lineTo(33, 0); ctx.lineTo(19, 5); ctx.lineTo(14, 12); ctx.lineTo(8, 5); ctx.lineTo(-3, 5);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#fffbe0';
            ctx.beginPath(); ctx.ellipse(7, 0, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
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
    const surface = mat === 'wood' ? texture(ctx, 'wood', 70) : mat === 'stone' || mat === 'foundation' ? texture(ctx, 'stone', 100) : undefined;
    if (surface) { ctx.fillStyle = surface; ctx.fillRect(-w / 2, -h / 2, w, h); }
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
    ctx.fillStyle = 'rgba(41,33,26,0.2)';
    ctx.fillRect(-w / 2 + 1, h / 2 - 3, w - 2, 2);
    if (mat === 'wood') {
        ctx.strokeStyle = '#80501d'; ctx.lineWidth = 2;
        ctx.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
        ctx.fillStyle = '#ffe0a1';
        for (const x of [-w / 2 + 5, w / 2 - 5]) for (const y of [-h / 2 + 5, h / 2 - 5]) {
            ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
        }
    }
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
        const { x, y } = renderedPosition(b, f.transforms);
        if (x < f.camera - 100 || x > f.camera + f.view.worldWidth + 100) continue;
        const angle = f.transforms.get(b.id)?.angle ?? b.angle;
        ctx.save();
        ctx.translate(x, y);
        if (b.label !== 'king') ctx.rotate(angle);
        if (b.label === 'king') {
            const kingSide = b.side ?? (Math.abs(x - (f.kings.left.x ?? 300)) < Math.abs(x - (f.kings.right.x ?? 2100)) ? 'left' : 'right');
            const hit = [...f.effects].reverse().find(e => e.kind === 'damage' && e.side === kingSide);
            const action = f.kingActions?.[kingSide];
            const presentation = kingPresentation({ now: f.now, side: kingSide, phase: f.phase, winner: f.winner,
                hp: f.kings[kingSide].hp, hitAt: hit?.at, resultAt: action?.resultAt, reducedMotion: f.reducedMotion });
            const king = kingReactions.get(presentation.pose, kingSide);
            const facing = kingSide === 'left' ? 1 : -1;
            const radius = b.circleRadius || b.height / 2 || 16;
            ctx.fillStyle = 'rgba(39,59,54,0.14)';
            ctx.beginPath(); ctx.ellipse(0, radius + 1, 19, 4, 0, 0, Math.PI * 2); ctx.fill();
            ctx.save();
            ctx.translate(0, radius);
            ctx.scale(facing, 1);
            const opacity = king ? presentation.reactionOpacity : 0;
            ctx.globalAlpha = 1 - opacity;
            const articulated = opacity < 1 && drawLivingKing(ctx, {
                side: kingSide, now: f.now, height: 80, reducedMotion: f.reducedMotion,
                shootAt: f.shot?.side === kingSide ? f.shot.at : undefined,
                looking: action?.look ?? (f.turn === kingSide ? 0.5 : 0), action,
            });
            ctx.globalAlpha = 1;
            if (king && (presentation.pose !== 'idle' || !articulated)) {
                ctx.globalAlpha = articulated ? opacity : 1;
                const scale = 80 / king.height;
                const pivot = kingReactions.metadata(kingSide).pivot;
                ctx.scale(1, presentation.scaleY);
                ctx.rotate(presentation.tilt);
                ctx.drawImage(king, -pivot.x * scale, -pivot.y * scale, king.width * scale, king.height * scale);
            }
            ctx.restore();
            if (!articulated && !king) {
                ctx.fillStyle = '#efb949';
                ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
            }
        } else if (b.label === 'projectile' || b.circleRadius) {
            const radius = b.circleRadius || 9;
            if (b.label === 'projectile') {
                const length = Math.min(f.reducedMotion ? 18 : 44, Math.hypot(b.velocity.x, b.velocity.y) * SHOT_FLIGHT_RATE * 1.6);
                const direction = Math.atan2(b.velocity.y, b.velocity.x) - angle;
                const dx = Math.cos(direction), dy = Math.sin(direction);
                const trail = ctx.createLinearGradient(-dx * length, -dy * length, 0, 0);
                trail.addColorStop(0, 'rgba(255,247,207,0)');
                trail.addColorStop(0.7, 'rgba(255,245,198,0.28)');
                trail.addColorStop(1, 'rgba(255,252,229,0.7)');
                ctx.fillStyle = trail;
                ctx.beginPath(); ctx.moveTo(-dx * length, -dy * length);
                ctx.lineTo(-dx * radius - dy * radius * 0.7, -dy * radius + dx * radius * 0.7);
                ctx.lineTo(dx * radius, dy * radius);
                ctx.lineTo(-dx * radius + dy * radius * 0.7, -dy * radius - dx * radius * 0.7);
                ctx.closePath(); ctx.fill();
            }
            ctx.fillStyle = b.label === 'projectile' ? '#314a60' : '#8c9a9a';
            ctx.strokeStyle = '#f4e2b1'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#c4dde5';
            ctx.beginPath(); ctx.arc(-radius * 0.28, -radius * 0.3, radius * 0.25, 0, Math.PI * 2); ctx.fill();
        } else if (b.label === 'foundation') {
            // Bury the support along the real terrain contour instead of leaving a floating slab.
            ctx.beginPath();
            ctx.moveTo(-b.width / 2, -b.height / 2);
            ctx.lineTo(b.width / 2, -b.height / 2);
            for (let column = b.width / 2; column >= -b.width / 2; column -= 5) {
                ctx.lineTo(column, terrainHeight(f.terrain?.points ?? [], x + column) - y + 5);
            }
            ctx.lineTo(-b.width / 2, terrainHeight(f.terrain?.points ?? [], x - b.width / 2) - y + 5);
            ctx.closePath(); ctx.clip();
            block(ctx, b);
        } else block(ctx, b);
        ctx.restore();
    }
}

function plate(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
    const image = battleArt.get('hud');
    if (!image) { ctx.fillStyle = '#123959'; ctx.fillRect(x, y, width, height); return; }
    const s = Math.round(image.height * 0.35), d = Math.min(18, height / 3, width / 4);
    const sx = [0, s, image.width - s], sy = [0, s, image.height - s];
    const sw = [s, image.width - 2 * s, s], sh = [s, image.height - 2 * s, s];
    const dx = [x, x + d, x + width - d], dy = [y, y + d, y + height - d];
    const dw = [d, width - 2 * d, d], dh = [d, height - 2 * d, d];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) ctx.drawImage(image, sx[col], sy[row], sw[col], sh[row], dx[col], dy[row], dw[col], dh[row]);
}

function health(ctx: CanvasRenderingContext2D, f: BattleFrame, side: Side) {
    const panel = healthPanel(f.view.width, f.view.height, side);
    const { compact, width, x, y: top, height: h, portraitWidth: pw } = panel;
    const king = f.kings[side];
    plate(ctx, x, top, width, h);
    const portrait = kingReactions.get('idle', side);
    if (portrait) {
        ctx.save();
        const cx = x + pw / 2 + 9;
        ctx.translate(cx, top + 6);
        if (side === 'right') ctx.scale(-1, 1);
        ctx.drawImage(portrait, portrait.width * 0.08, portrait.height * 0.02, portrait.width * 0.84, portrait.height * 0.55, -pw / 2, 0, pw, h - 15);
        ctx.restore();
    }
    const content = x + pw + 15, right = x + width - 12, available = right - content;
    ctx.font = `700 ${compact ? 11 : 16}px system-ui`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff8e5';
    let name = f.names?.[side] || (side === f.side ? 'You' : 'Opponent');
    while (ctx.measureText(name).width > available - 30 && name.length > 1) name = name.slice(0, -2) + '\u2026';
    ctx.fillText(name, content, top + (compact ? 19 : 27));
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.max(0, Math.ceil(king.hp))}`, right, top + (compact ? 19 : 27));
    const by = top + (compact ? 26 : 37), bh = compact ? 10 : 16;
    ctx.fillStyle = '#051c32'; ctx.fillRect(content, by, available, bh);
    const gloss = ctx.createLinearGradient(0, by, 0, by + bh);
    gloss.addColorStop(0, side === 'left' ? '#ffb29a' : '#a7ffbd');
    gloss.addColorStop(0.32, side === 'left' ? '#fb4243' : '#24df66');
    gloss.addColorStop(1, side === 'left' ? '#ab1422' : '#08763c');
    ctx.fillStyle = gloss;
    ctx.fillRect(content, by, available * Math.max(0, Math.min(1, king.hp / Math.max(1, king.maxHp))), bh);
    ctx.strokeStyle = '#d8b96b'; ctx.lineWidth = 1;
    ctx.strokeRect(content, by, available, bh);
}

function minimap(ctx: CanvasRenderingContext2D, f: BattleFrame) {
    const box = minimapRect(f.view);
    ctx.save();
    plate(ctx, box.x - 4, box.y - 4, box.width + 8, box.height + 8);
    ctx.beginPath(); ctx.rect(box.x, box.y, box.width, box.height); ctx.clip();
    ctx.fillStyle = '#a6daed'; ctx.fillRect(box.x + 3, box.y + 3, box.width - 6, box.height - 6);
    const valley = battleArt.get('valley');
    if (valley) { ctx.globalAlpha = 0.65; ctx.drawImage(valley, box.x, box.y, box.width, box.height); ctx.globalAlpha = 1; }
    const sx = box.width / WORLD_WIDTH;
    const sy = box.height / 600;
    ctx.beginPath(); ctx.moveTo(box.x, box.y + box.height);
    for (const p of f.terrain?.points ?? []) ctx.lineTo(box.x + p.x * sx, box.y + p.y * sy);
    ctx.lineTo(box.x + box.width, box.y + box.height); ctx.closePath();
    ctx.fillStyle = '#88aa6b'; ctx.fill();
    for (const b of f.state?.bodies ?? []) {
        if (b.isStatic) continue;
        ctx.fillStyle = b.label === 'king'
            ? ((b.side ?? (Math.abs(b.position.x - (f.kings.left.x ?? 600)) < Math.abs(b.position.x - (f.kings.right.x ?? 1800)) ? 'left' : 'right')) === 'left' ? '#bb5948' : '#167f7a')
            : b.label === 'projectile' ? '#d64c48' : '#51748b';
        const position = renderedPosition(b, f.transforms);
        ctx.fillRect(box.x + position.x * sx - 1, box.y + position.y * sy - 2, b.label === 'king' ? 4 : 2, 3);
    }
    ctx.strokeStyle = '#fff1ae';
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
    // Foreground barrels occlude the emerging projectile instead of drawing it over metal.
    cannon(ctx, f, 'left'); cannon(ctx, f, 'right');
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
            // Numbers are laid out in screen space below, independent of camera zoom.
        } else if (effect.kind === 'impact') {
            const ground = effect.target === 'terrain';
            ctx.strokeStyle = ground ? '#d3c3a1' : effect.material === 'steel' ? '#b8e8fb' : '#fff0ae';
            ctx.lineWidth = (ground ? 2 : 4) * (1 - age);
            ctx.beginPath(); ctx.arc(effect.x, effect.y, 7 + age * (f.reducedMotion ? 3 : ground ? 19 : 35), 0, Math.PI * 2); ctx.stroke();
            if (!f.reducedMotion && age < 0.24) {
                ctx.fillStyle = '#fff4c5';
                ctx.beginPath(); ctx.ellipse(effect.x, effect.y, 12 * (1 - age), 9 * (1 - age), 0, 0, Math.PI * 2); ctx.fill();
            }
        } else {
            // Breakage stays material-colored; ice and stone do not erupt as fireballs.
            ctx.globalAlpha *= 0.24;
            ctx.strokeStyle = (MATERIALS[effect.material ?? 'stone'] ?? MATERIALS.stone)[0];
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(effect.x, effect.y, 6 + age * (f.reducedMotion ? 2 : 19), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
    }
    ctx.restore();
    health(ctx, f, 'left'); health(ctx, f, 'right');
    if (showBattleMinimap(f.view)) minimap(ctx, f);
    const excluded = [{ x: 0, y: 0, width: f.view.width, height: 68 }, healthPanel(f.view.width, f.view.height, 'left'),
        healthPanel(f.view.width, f.view.height, 'right'), ...(showBattleMinimap(f.view) ? [minimapRect(f.view)] : [])];
    const cues = f.effects.flatMap(effect => {
        const cue = hitFeedback(effect, f.hitLabels !== false);
        if (!cue || f.now - effect.at >= 950) return [];
        const point = worldToScreen(effect, f.camera, f.view);
        if (point.x < -50 || point.x > f.view.width + 50 || point.y < 0 || point.y > f.view.height + 50) return [];
        return [{ ...cue, x: point.x, y: point.y - 56 - (f.reducedMotion ? 0 : (f.now - effect.at) / 950 * 20), at: effect.at }];
    });
    for (const cue of layoutHitFeedback(cues, f.view.width, f.view.height, excluded)) {
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - (f.now - cue.at) / 950);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
        ctx.strokeStyle = '#092339'; ctx.fillStyle = cue.color; ctx.lineWidth = 4;
        const x = cue.box.x + cue.box.width / 2, y = cue.box.y;
        if (cue.caption) {
            ctx.font = '800 11px system-ui'; ctx.strokeText(cue.caption, x, y); ctx.fillText(cue.caption, x, y);
        }
        if (cue.amount) {
            ctx.font = `800 ${cue.priority >= 90 ? 23 : 18}px system-ui`;
            ctx.strokeText(cue.amount, x, y + (cue.caption ? 17 : 0)); ctx.fillText(cue.amount, x, y + (cue.caption ? 17 : 0));
        }
        ctx.restore();
    }
    const projectile = f.state?.bodies.find(b => b.id === f.projectileId);
    if (projectile) {
        const point = worldToScreen(renderedPosition(projectile, f.transforms), f.camera, f.view);
        if (point.y < 65) {
            const x = Math.max(16, Math.min(f.view.width - 16, point.x));
            ctx.fillStyle = '#325773';
            ctx.beginPath(); ctx.moveTo(x, 65); ctx.lineTo(x - 6, 73); ctx.lineTo(x + 6, 73); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.arc(x, 83, 5, 0, Math.PI * 2); ctx.fill();
        }
    }
}
