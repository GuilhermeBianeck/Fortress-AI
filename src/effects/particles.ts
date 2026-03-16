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
    /** Fixed-size pool — only [0, count) are alive */
    private pool: Particle[];
    /** Number of live particles (always ≤ pool.length) */
    count = 0;

    constructor() {
        // Pre-allocate the full pool so no objects are created at runtime
        this.pool = new Array<Particle>(MAX_PARTICLES);
        for (let i = 0; i < MAX_PARTICLES; i++) {
            this.pool[i] = { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '', size: 0 };
        }
    }

    emit(x: number, y: number, count: number, color: string, baseVelocity?: { x: number; y: number }) {
        const bvx = baseVelocity?.x ?? 0;
        const bvy = baseVelocity?.y ?? 0;

        for (let i = 0; i < count; i++) {
            if (this.count >= MAX_PARTICLES) {
                // Overwrite oldest (index 0) by swapping it to end, then reuse
                const oldest = this.pool[0];
                this.pool[0] = this.pool[this.count - 1];
                this.pool[this.count - 1] = oldest;
                this.count--;
            }
            // Reuse an inactive slot from the pool
            const p = this.pool[this.count];
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            const life = 30 + Math.random() * 30;
            p.x = x;
            p.y = y;
            p.vx = Math.cos(angle) * speed + bvx * 0.3;
            p.vy = Math.sin(angle) * speed + bvy * 0.3 - 1;
            p.life = life;
            p.maxLife = life;
            p.color = color;
            p.size = 2 + Math.random() * 2;
            this.count++;
        }
    }

    update() {
        let i = 0;
        while (i < this.count) {
            const p = this.pool[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += GRAVITY;
            p.life--;

            if (p.life <= 0) {
                // Swap-and-pop: O(1) removal
                this.count--;
                const tmp = this.pool[i];
                this.pool[i] = this.pool[this.count];
                this.pool[this.count] = tmp;
                // Don't increment i — re-check the swapped-in particle
            } else {
                i++;
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        for (let i = 0; i < this.count; i++) {
            const p = this.pool[i];
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
    }
}
