import Matter from 'matter-js';
import { Server } from 'socket.io';

const TICK_RATE = 60;
const SNAPSHOT_RATE = 20;
const TICK_DT = 1000 / TICK_RATE;

// Material color map for client rendering
const MATERIAL_COLORS: Record<string, string> = {
    wood: '#A67C52',
    stone: '#7D7D7D',
    ice: '#A5F2F3',
    rubber: '#FF69B4',
    steel: '#434B4D',
    king: '#FFD700',
};

export class GameLoop {
    private engine: Matter.Engine;
    private io: Server;
    private interval: ReturnType<typeof setInterval> | null = null;
    private lastSnapshotTime = 0;

    constructor(engine: Matter.Engine, io: Server) {
        this.engine = engine;
        this.io = io;
    }

    start() {
        if (this.interval) return;

        this.interval = setInterval(() => {
            this.tick();
        }, TICK_DT);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    private tick() {
        // Fixed timestep update
        Matter.Engine.update(this.engine, TICK_DT);

        // Snapshot broadcast
        const now = Date.now();
        if (now - this.lastSnapshotTime > (1000 / SNAPSHOT_RATE)) {
            this.broadcastState();
            this.lastSnapshotTime = now;
        }
    }

    private broadcastState() {
        const bodies = Matter.Composite.allBodies(this.engine.world).map(body => {
            // Calculate bounding box dimensions from vertices
            const bounds = body.bounds;
            const width = bounds.max.x - bounds.min.x;
            const height = bounds.max.y - bounds.min.y;

            return {
                id: body.id,
                position: body.position,
                angle: body.angle,
                velocity: body.velocity,
                label: body.label,
                isStatic: body.isStatic,
                width,
                height,
                circleRadius: (body as any).circleRadius || 0,
                material: body.label || 'default',
                color: MATERIAL_COLORS[body.label] || '#e11d48',
            };
        });

        this.io.emit('gameState', {
            bodies,
            timestamp: Date.now()
        });
    }
}
