import Matter from 'matter-js';
import { Server } from 'socket.io';
import type { KingState } from '../types';
import { MATERIAL_COLORS } from '../config/constants';

const TICK_RATE = 60;
const SNAPSHOT_RATE = 20;
const TICK_DT = 1000 / TICK_RATE;

export class GameLoop {
    private engine: Matter.Engine;
    private io: Server;
    private interval: ReturnType<typeof setInterval> | null = null;
    private lastSnapshotTime = 0;
    private kingState: KingState | null = null;
    private onTickCallback: (() => void) | null = null;

    constructor(engine: Matter.Engine, io: Server, kingState?: KingState) {
        this.engine = engine;
        this.io = io;
        this.kingState = kingState ?? null;
    }

    setKingState(kingState: KingState) {
        this.kingState = kingState;
    }

    setOnTick(cb: () => void) {
        this.onTickCallback = cb;
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

        this.onTickCallback?.();

        // Snapshot broadcast
        const now = Date.now();
        if (now - this.lastSnapshotTime > (1000 / SNAPSHOT_RATE)) {
            this.broadcastState();
            this.lastSnapshotTime = now;
        }
    }

    private broadcastState() {
        const bodies = Matter.Composite.allBodies(this.engine.world).map(body => {
            // Use stamped original dimensions to avoid AABB flicker on rotation
            const width = (body as any).originalWidth || (body.bounds.max.x - body.bounds.min.x);
            const height = (body as any).originalHeight || (body.bounds.max.y - body.bounds.min.y);

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
                blockHp: (body as any).blockHp ?? null,
                blockMaxHp: (body as any).blockMaxHp ?? null,
            };
        });

        this.io.emit('gameState', {
            bodies,
            timestamp: Date.now(),
            kingHp: this.kingState?.hp ?? 0,
            kingMaxHp: this.kingState?.maxHp ?? 0,
        });
    }
}
