const KINDS = ['debris', 'splinter', 'chip', 'shard', 'fleck', 'spark', 'smoke'] as const;
const MATERIALS = ['generic', 'wood', 'stone', 'ice', 'rubber', 'steel'] as const;

export type ParticleKind = typeof KINDS[number];
export type ParticleMaterial = typeof MATERIALS[number];

export interface ParticleDebugCounts {
    total: number;
    byKind: Record<ParticleKind, number>;
    byMaterial: Record<ParticleMaterial, number>;
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    ageMs: number;
    lifetimeMs: number;
    color: string;
    size: number;
    kind: ParticleKind;
    material: ParticleMaterial;
    gravity: number;
    drag: number;
    rotation: number;
    spin: number;
}

interface MaterialEffect {
    kind: ParticleKind;
    colors: readonly string[];
    count: number;
    size: readonly [number, number];
    lifetime: readonly [number, number];
    speed: readonly [number, number];
    gravity: number;
    drag: number;
    spin: number;
}

const MAX_PARTICLES = 300;
const MAX_BURST = 32;
const FRAME_MS = 1000 / 60;
const KIND_LIMITS: Record<ParticleKind, number> = {
    debris: 64, splinter: 72, chip: 72, shard: 72, fleck: 48, spark: 96, smoke: 48,
};
const SPARK_COLORS = ['#FFF4AD', '#FFD05C', '#FFAA57', '#FFFFFF'] as const;
const SMOKE_COLORS = ['#FFF8E8', '#EDF5FC', '#FFFFFF'] as const;
const MATERIAL_EFFECTS: Record<Exclude<ParticleMaterial, 'generic'>, MaterialEffect> = {
    wood: {
        kind: 'splinter', colors: ['#EBA855', '#FFD38B', '#BA763B', '#F5C16D'], count: 12,
        size: [6, 11], lifetime: [550, 1050], speed: [100, 230], gravity: 500, drag: 1.2, spin: 10,
    },
    stone: {
        kind: 'chip', colors: ['#9EB4C6', '#D5E3ED', '#8199AF', '#B8CDD9'], count: 14,
        size: [4, 8], lifetime: [450, 900], speed: [85, 175], gravity: 650, drag: 0.8, spin: 7,
    },
    ice: {
        kind: 'shard', colors: ['#89E8FA', '#D5FBFF', '#5CC8ED', '#FFFFFF'], count: 18,
        size: [5, 9], lifetime: [450, 850], speed: [110, 240], gravity: 240, drag: 1.7, spin: 9,
    },
    rubber: {
        kind: 'fleck', colors: ['#F57AAE', '#CB6CDB', '#FFACD2', '#A884ED'], count: 10,
        size: [4, 7], lifetime: [650, 1050], speed: [120, 220], gravity: 400, drag: 2.6, spin: 12,
    },
    steel: {
        kind: 'spark', colors: SPARK_COLORS, count: 18,
        size: [1, 2], lifetime: [160, 400], speed: [280, 540], gravity: 150, drag: 4.6, spin: 0,
    },
};

function inheritedVelocity(value = 0): number {
    return Number.isFinite(value) ? Math.max(-360, Math.min(360, value * 24)) : 0;
}

/** Pooled, world-space cartoon debris. Velocities are px/s and lifetimes are ms. */
export class ParticleSystem {
    private readonly pool: Particle[];
    private readonly random: () => number;
    private readonly kindCounts: Record<ParticleKind, number> = {
        debris: 0, splinter: 0, chip: 0, shard: 0, fleck: 0, spark: 0, smoke: 0,
    };
    private readonly materialCounts: Record<ParticleMaterial, number> = {
        generic: 0, wood: 0, stone: 0, ice: 0, rubber: 0, steel: 0,
    };
    count = 0;

    constructor(random: () => number = Math.random) {
        this.random = random;
        this.pool = new Array<Particle>(MAX_PARTICLES);
        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.pool[i] = {
                x: 0, y: 0, vx: 0, vy: 0, ageMs: 0, lifetimeMs: 1,
                color: '', size: 0, kind: 'debris', material: 'generic',
                gravity: 0, drag: 1, rotation: 0, spin: 0,
            };
        }
    }

    private available(kind: ParticleKind, requested: number): number {
        return Math.max(0, Math.min(MAX_BURST, requested,
            MAX_PARTICLES - this.count, KIND_LIMITS[kind] - this.kindCounts[kind]));
    }

    private range(min: number, max: number): number {
        return min + this.random() * (max - min);
    }

    private color(colors: readonly string[]): string {
        return colors[Math.floor(this.random() * colors.length)];
    }

    private spawn(
        kind: ParticleKind, material: ParticleMaterial, x: number, y: number,
        vx: number, vy: number, lifetimeMs: number, color: string, size: number,
        gravity: number, drag: number, rotation = 0, spin = 0,
    ): void {
        const p = this.pool[this.count++];
        p.kind = kind; p.material = material;
        p.x = x; p.y = y; p.vx = vx; p.vy = vy;
        p.ageMs = 0; p.lifetimeMs = lifetimeMs;
        p.color = color; p.size = size; p.gravity = gravity; p.drag = drag;
        p.rotation = rotation; p.spin = spin;
        this.kindCounts[kind]++;
        this.materialCounts[material]++;
    }

    /** Existing generic debris entry point; each call is limited to 32 particles. */
    emit(x: number, y: number, count: number, color: string, baseVelocity?: { x: number; y: number }): void {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(count)) return;
        const amount = this.available('debris', Math.floor(count));
        const bvx = inheritedVelocity(baseVelocity?.x);
        const bvy = inheritedVelocity(baseVelocity?.y);
        for (let i = 0; i < amount; i++) {
            const angle = this.range(0, Math.PI * 2);
            const speed = this.range(60, 180);
            this.spawn('debris', 'generic', x, y,
                Math.cos(angle) * speed + bvx, Math.sin(angle) * speed + bvy - 60,
                this.range(500, 1000), color, this.range(2, 4), 360, 1.6,
                angle, this.range(-8, 8));
        }
    }

    emitMaterial(x: number, y: number, material: string, velocity?: { x: number; y: number }): void {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const name = Object.hasOwn(MATERIAL_EFFECTS, material)
            ? material as Exclude<ParticleMaterial, 'generic'> : 'wood';
        const config = MATERIAL_EFFECTS[name];
        const amount = this.available(config.kind, config.count);
        const bvx = inheritedVelocity(velocity?.x);
        const bvy = inheritedVelocity(velocity?.y);
        for (let i = 0; i < amount; i++) {
            const angle = this.range(0, Math.PI * 2);
            const speed = this.range(config.speed[0], config.speed[1]);
            this.spawn(config.kind, name, x + this.range(-4, 4), y + this.range(-3, 3),
                Math.cos(angle) * speed + bvx, Math.sin(angle) * speed + bvy - 70,
                this.range(config.lifetime[0], config.lifetime[1]), this.color(config.colors),
                this.range(config.size[0], config.size[1]), config.gravity, config.drag,
                angle, this.range(-config.spin, config.spin));
        }
    }

    /** Short radial streaks, without an opaque flash or screen-space effects. */
    emitImpact(x: number, y: number): void {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const amount = this.available('spark', 10);
        for (let i = 0; i < amount; i++) {
            const angle = this.range(0, Math.PI * 2);
            const speed = this.range(180, 370);
            this.spawn('spark', 'generic', x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
                this.range(110, 230), this.color(SPARK_COLORS), this.range(0.8, 1.6), 120, 5);
        }
    }

    emitSmoke(x: number, y: number): void {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const amount = this.available('smoke', 5);
        for (let i = 0; i < amount; i++) {
            this.spawn('smoke', 'generic', x + this.range(-5, 5), y + this.range(-3, 3),
                this.range(-22, 22), this.range(-40, -15), this.range(650, 1100),
                this.color(SMOKE_COLORS), this.range(6, 10), -18, 1.8, this.range(-0.5, 0.5));
        }
    }

    /** x/y is the exact muzzle. Angle is upward elevation; facing=-1 mirrors horizontally. */
    emitMuzzle(x: number, y: number, angleRadians: number, facing = 1): void {
        if (!Number.isFinite(x) || !Number.isFinite(y) ||
            !Number.isFinite(angleRadians) || !Number.isFinite(facing)) return;
        const direction = facing < 0 ? -1 : 1;
        const sparks = this.available('spark', 10);
        for (let i = 0; i < sparks; i++) {
            const angle = angleRadians + this.range(-0.2, 0.2);
            const speed = this.range(210, 450);
            this.spawn('spark', 'generic', x, y,
                direction * Math.cos(angle) * speed, -Math.sin(angle) * speed,
                this.range(100, 220), this.color(SPARK_COLORS), this.range(0.8, 1.6), 90, 4.5);
        }
        const smoke = this.available('smoke', 5);
        for (let i = 0; i < smoke; i++) {
            const angle = angleRadians + this.range(-0.35, 0.35);
            const speed = this.range(30, 85);
            this.spawn('smoke', 'generic', x, y,
                direction * Math.cos(angle) * speed, -Math.sin(angle) * speed,
                this.range(600, 1000), this.color(SMOKE_COLORS), this.range(6, 10), -18, 2.2,
                this.range(-0.4, 0.4));
        }
    }

    update(deltaMs = FRAME_MS): void {
        if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
        let i = 0;
        while (i < this.count) {
            const p = this.pool[i];
            p.ageMs += deltaMs;
            if (p.ageMs >= p.lifetimeMs) {
                this.kindCounts[p.kind]--;
                this.materialCounts[p.material]--;
                this.count--;
                this.pool[i] = this.pool[this.count];
                this.pool[this.count] = p;
                continue;
            }

            // Analytic drag + constant acceleration keeps motion independent of frame partitioning.
            const dt = deltaMs / 1000;
            const damping = Math.exp(-p.drag * dt);
            const travel = -Math.expm1(-p.drag * dt) / p.drag;
            p.x += p.vx * travel;
            p.y += p.vy * travel + p.gravity * (dt - travel) / p.drag;
            p.vx *= damping;
            p.vy = p.vy * damping + p.gravity * travel;
            p.rotation += p.spin * dt;
            i++;
        }
    }

    reset(): void {
        this.count = 0;
        for (const kind of KINDS) this.kindCounts[kind] = 0;
        for (const material of MATERIALS) this.materialCounts[material] = 0;
    }

    /** Detached diagnostic snapshot; emit/update/draw never allocate particle objects. */
    debugCounts(): ParticleDebugCounts {
        return { total: this.count, byKind: { ...this.kindCounts }, byMaterial: { ...this.materialCounts } };
    }

    draw(ctx: CanvasRenderingContext2D, cameraX = 0, viewportWidth = 800): void {
        const left = cameraX - 56;
        const right = cameraX + viewportWidth + 56;
        ctx.save();
        const inheritedAlpha = ctx.globalAlpha;
        ctx.lineCap = 'round';
        for (let i = 0; i < this.count; i++) {
            const p = this.pool[i];
            if (p.x < left || p.x > right) continue;
            const progress = p.ageMs / p.lifetimeMs;
            const alpha = inheritedAlpha * Math.min(1, (1 - progress) * 2.2);
            const size = p.size;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.kind === 'spark' ? Math.atan2(p.vy, p.vx) : p.rotation);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;

            switch (p.kind) {
                case 'splinter':
                    ctx.beginPath();
                    ctx.moveTo(-size * 0.65, -size * 0.12);
                    ctx.lineTo(size * 0.65, -size * 0.07);
                    ctx.lineTo(size * 0.4, size * 0.13);
                    ctx.lineTo(-size * 0.5, size * 0.17);
                    ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = '#FFE4AF'; ctx.lineWidth = 0.7;
                    ctx.beginPath(); ctx.moveTo(-size * 0.4, 0); ctx.lineTo(size * 0.4, 0); ctx.stroke();
                    break;
                case 'chip':
                    ctx.beginPath();
                    ctx.moveTo(-size * 0.55, -size * 0.1);
                    ctx.lineTo(-size * 0.1, -size * 0.6);
                    ctx.lineTo(size * 0.5, -size * 0.25);
                    ctx.lineTo(size * 0.4, size * 0.45);
                    ctx.lineTo(-size * 0.35, size * 0.5);
                    ctx.closePath(); ctx.fill();
                    ctx.globalAlpha = alpha * 0.55; ctx.fillStyle = '#F4FBFF';
                    ctx.beginPath(); ctx.moveTo(-size * 0.55, -size * 0.1);
                    ctx.lineTo(-size * 0.1, -size * 0.6); ctx.lineTo(size * 0.15, 0);
                    ctx.closePath(); ctx.fill();
                    break;
                case 'shard':
                    ctx.beginPath();
                    ctx.moveTo(0, -size * 0.8); ctx.lineTo(size * 0.5, size * 0.45);
                    ctx.lineTo(-size * 0.45, size * 0.3); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = '#E8FDFF'; ctx.lineWidth = 0.8; ctx.stroke();
                    ctx.globalAlpha = alpha * 0.55; ctx.fillStyle = '#FFFFFF';
                    ctx.beginPath(); ctx.moveTo(0, -size * 0.8); ctx.lineTo(0, size * 0.3);
                    ctx.lineTo(-size * 0.45, size * 0.3); ctx.closePath(); ctx.fill();
                    break;
                case 'fleck': {
                    const stretch = 1 + Math.sin(p.ageMs * 0.018) * 0.25 * Math.exp(-progress * 2);
                    ctx.scale(stretch, 1 / stretch);
                    ctx.beginPath(); ctx.moveTo(-size * 0.55, 0);
                    ctx.quadraticCurveTo(-size * 0.3, -size * 0.55, size * 0.25, -size * 0.35);
                    ctx.quadraticCurveTo(size * 0.7, -size * 0.1, size * 0.45, size * 0.3);
                    ctx.quadraticCurveTo(0, size * 0.65, -size * 0.55, 0);
                    ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = '#FFE2F3'; ctx.lineWidth = 0.7; ctx.stroke();
                    break;
                }
                case 'spark': {
                    const speed = Math.hypot(p.vx, p.vy);
                    const tail = Math.min(22, 3 + speed * 0.035, speed * p.ageMs / 1000);
                    ctx.strokeStyle = p.color; ctx.lineWidth = size * 1.8;
                    ctx.beginPath(); ctx.moveTo(-tail, 0); ctx.lineTo(0, 0); ctx.stroke();
                    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(0.5, size * 0.5);
                    ctx.beginPath(); ctx.moveTo(-tail * 0.55, 0); ctx.lineTo(0, 0); ctx.stroke();
                    break;
                }
                case 'smoke': {
                    const radius = size * (0.8 + progress * 1.6);
                    const opacity = inheritedAlpha * 0.18 * (1 - progress) *
                        (0.25 + 0.75 * Math.min(1, p.ageMs / 80));
                    // Low-alpha nested lobes soften the edge without per-frame gradients or bitmaps.
                    for (let layer = 0; layer < 3; layer++) {
                        const r = radius * (1 - layer * 0.22);
                        ctx.globalAlpha = opacity * (0.2 + layer * 0.14);
                        ctx.beginPath();
                        ctx.ellipse(-r * 0.25, r * 0.08, r * 0.75, r * 0.58, 0, 0, Math.PI * 2);
                        ctx.ellipse(r * 0.3, -r * 0.1, r * 0.65, r * 0.52, 0, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    break;
                }
                case 'debris':
                    ctx.fillRect(-size / 2, -size / 2, size, size);
                    break;
            }
            ctx.restore();
        }
        ctx.restore();
    }
}
