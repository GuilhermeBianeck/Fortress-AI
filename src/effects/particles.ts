interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    color: string;
    size: number;
}

const MAX_PARTICLES = 200;
const GRAVITY = 0.1;

export class ParticleSystem {
    particles: Particle[] = [];

    emit(x: number, y: number, count: number, color: string, baseVelocity?: { x: number; y: number }) {
        const bvx = baseVelocity?.x ?? 0;
        const bvy = baseVelocity?.y ?? 0;

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            const life = 30 + Math.random() * 30;

            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed + bvx * 0.3,
                vy: Math.sin(angle) * speed + bvy * 0.3 - 1,
                life,
                maxLife: life,
                color,
                size: 2 + Math.random() * 2,
            });
        }

        // FIFO eviction
        if (this.particles.length > MAX_PARTICLES) {
            this.particles.splice(0, this.particles.length - MAX_PARTICLES);
        }
    }

    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += GRAVITY;
            p.life--;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        for (const p of this.particles) {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
    }
}
