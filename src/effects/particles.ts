/**
 * Particle system with material-specific destruction effects, impact flashes, and smoke.
 * Uses a fixed-size pre-allocated pool for zero-allocation runtime.
 */

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    color: string;
    size: number;
    shape: 'square' | 'circle';
    gravity: number;
}

const MAX_PARTICLES = 300;
const DEFAULT_GRAVITY = 0.1;

// Material-specific destruction particle configs
const MATERIAL_PARTICLES: Record<string, { colors: string[]; sizes: [number, number]; count: number; shape: 'square' | 'circle' }> = {
    wood:    { colors: ['#8B6B42', '#A88B5E', '#5C3D1E', '#C4A876'], sizes: [2, 5], count: 12, shape: 'square' },
    stone:   { colors: ['#5A5A6A', '#7A7A8A', '#3a3a4a', '#9A9AAA'], sizes: [2, 4], count: 15, shape: 'square' },
    ice:     { colors: ['#7EC8D0', '#B0E8F0', '#5AA8B0', '#FFFFFF'], sizes: [1, 3], count: 20, shape: 'circle' },
    rubber:  { colors: ['#D45090', '#F070B0', '#A03868'],            sizes: [3, 6], count: 8,  shape: 'circle' },
    steel:   { colors: ['#4A5560', '#8A9AA0', '#FFD700', '#FFFFFF'], sizes: [1, 3], count: 10, shape: 'circle' },
};

export class ParticleSystem {
    private pool: Particle[];
    count = 0;

    constructor() {
        this.pool = new Array<Particle>(MAX_PARTICLES);
        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.pool[i] = { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '', size: 0, shape: 'square', gravity: DEFAULT_GRAVITY };
        }
    }

    private spawnOne(x: number, y: number, vx: number, vy: number, life: number, color: string, size: number, shape: 'square' | 'circle' = 'square', gravity: number = DEFAULT_GRAVITY) {
        if (this.count >= MAX_PARTICLES) {
            const oldest = this.pool[0];
            this.pool[0] = this.pool[this.count - 1];
            this.pool[this.count - 1] = oldest;
            this.count--;
        }
        const p = this.pool[this.count];
        p.x = x; p.y = y; p.vx = vx; p.vy = vy;
        p.life = life; p.maxLife = life;
        p.color = color; p.size = size; p.shape = shape; p.gravity = gravity;
        this.count++;
    }

    /** Generic emit (backwards compatible) */
    emit(x: number, y: number, count: number, color: string, baseVelocity?: { x: number; y: number }) {
        const bvx = baseVelocity?.x ?? 0;
        const bvy = baseVelocity?.y ?? 0;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            const life = 30 + Math.random() * 30;
            const size = 2 + Math.random() * 2;
            this.spawnOne(
                x, y,
                Math.cos(angle) * speed + bvx * 0.3,
                Math.sin(angle) * speed + bvy * 0.3 - 1,
                life, color, size,
            );
        }
    }

    /** Material-specific destruction particles — debris flies in impact direction */
    emitMaterial(x: number, y: number, material: string, velocity?: { x: number; y: number }) {
        const config = MATERIAL_PARTICLES[material] || MATERIAL_PARTICLES.wood;
        const bvx = velocity?.x ?? 0;
        const bvy = velocity?.y ?? 0;
        for (let i = 0; i < config.count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 4;
            const life = 25 + Math.random() * 35;
            const size = config.sizes[0] + Math.random() * (config.sizes[1] - config.sizes[0]);
            const color = config.colors[Math.floor(Math.random() * config.colors.length)];
            this.spawnOne(
                x + (Math.random() - 0.5) * 8,
                y + (Math.random() - 0.5) * 8,
                Math.cos(angle) * speed + bvx * 0.4,
                Math.sin(angle) * speed + bvy * 0.4 - 1.5,
                life, color, size, config.shape,
            );
        }
    }

    /** Bright impact flash — fast, short-lived orange/yellow sparks */
    emitImpact(x: number, y: number) {
        const colors = ['#FFA030', '#FFD060', '#FFF0A0', '#FFFFFF'];
        for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 5;
            const color = colors[Math.floor(Math.random() * colors.length)];
            this.spawnOne(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 2,
                8 + Math.random() * 6, color, 1 + Math.random() * 2, 'circle', 0.05,
            );
        }
    }

    /** Lingering smoke/dust cloud — slow, large, fades slowly */
    emitSmoke(x: number, y: number) {
        const colors = ['#555555', '#666666', '#777777', '#444444'];
        for (let i = 0; i < 5; i++) {
            const color = colors[Math.floor(Math.random() * colors.length)];
            this.spawnOne(
                x + (Math.random() - 0.5) * 12,
                y + (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 0.5,
                -0.3 - Math.random() * 0.5,
                50 + Math.random() * 30, color, 4 + Math.random() * 4, 'circle', 0.01,
            );
        }
    }

    update(deltaMs = 1000 / 60) {
        const step = Math.max(0, Math.min(3, deltaMs / (1000 / 60)));
        let i = 0;
        while (i < this.count) {
            const p = this.pool[i];
            p.x += p.vx * step;
            p.y += p.vy * step;
            p.vy += p.gravity * step;
            p.vx *= Math.pow(0.99, step);
            p.life -= step;

            if (p.life <= 0) {
                this.count--;
                const tmp = this.pool[i];
                this.pool[i] = this.pool[this.count];
                this.pool[this.count] = tmp;
            } else {
                i++;
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, cameraX: number = 0, viewportWidth: number = 800) {
        const margin = 50;
        const cullLeft = cameraX - margin;
        const cullRight = cameraX + viewportWidth + margin;

        for (let i = 0; i < this.count; i++) {
            const p = this.pool[i];
            if (p.x < cullLeft || p.x > cullRight) continue;
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.fillStyle = p.color;

            if (p.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }
        }
        ctx.globalAlpha = 1;
    }
}
