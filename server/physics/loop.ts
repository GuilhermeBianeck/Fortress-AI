import Matter from 'matter-js';
import { Server } from 'socket.io';
import type { KingState } from '../types';
import { MATERIAL_COLORS } from '../config/constants';

const TICK_RATE = 60;
const SNAPSHOT_RATE = 20;
const TICK_DT = 1000 / TICK_RATE;

// Full sync every 60 snapshots (3 seconds) to recover from any dropped packets
const FULL_SYNC_INTERVAL = 60;

// Compact update tuple indices: [id, x, y, angle, vx, vy, hp]
// Using arrays instead of objects saves ~40% payload size per body

export class GameLoop {
    private engine: Matter.Engine;
    private io: Server;
    private roomId: string;
    private interval: ReturnType<typeof setInterval> | null = null;
    private lastSnapshotTime = 0;
    private kingStates: Map<string, KingState> = new Map(); // side → KingState
    private onTickCallback: (() => void) | null = null;

    // Delta encoding state
    private knownBodyIds: Set<number> = new Set();
    private snapshotCount = 0;

    constructor(engine: Matter.Engine, io: Server, roomId: string) {
        this.engine = engine;
        this.io = io;
        this.roomId = roomId;
    }

    setKingState(side: string, kingState: KingState) {
        this.kingStates.set(side, kingState);
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

    /** Reset delta tracking (e.g. on round restart) */
    resetDelta() {
        this.knownBodyIds.clear();
        this.snapshotCount = 0;
    }

    private tick() {
        // Sub-step: 2 half-updates per tick for better collision detection
        Matter.Engine.update(this.engine, TICK_DT / 2);
        this.onTickCallback?.();
        Matter.Engine.update(this.engine, TICK_DT / 2);

        // Snapshot broadcast
        const now = Date.now();
        if (now - this.lastSnapshotTime > (1000 / SNAPSHOT_RATE)) {
            this.broadcastState();
            this.lastSnapshotTime = now;
        }
    }

    private broadcastState() {
        const allBodies = Matter.Composite.allBodies(this.engine.world);
        this.snapshotCount++;
        const isFullSync = this.snapshotCount % FULL_SYNC_INTERVAL === 0;

        // New bodies: full metadata (sent once per body, or on full-sync)
        const newBodies: any[] = [];
        // Dynamic updates: compact array tuples [id, x, y, angle, vx, vy, hp]
        const updates: number[][] = [];
        // Track current body IDs to detect removals
        const currentIds = new Set<number>();

        for (const body of allBodies) {
            currentIds.add(body.id);

            const isNew = !this.knownBodyIds.has(body.id);

            if (isNew || isFullSync) {
                // Send full metadata for new bodies or during periodic full sync
                const width = (body as any).originalWidth || (body.bounds.max.x - body.bounds.min.x);
                const height = (body as any).originalHeight || (body.bounds.max.y - body.bounds.min.y);

                newBodies.push({
                    id: body.id,
                    label: body.label,
                    isStatic: body.isStatic,
                    width,
                    height,
                    circleRadius: (body as any).circleRadius || 0,
                    material: body.label || 'default',
                    color: MATERIAL_COLORS[body.label] || '#e11d48',
                    blockMaxHp: (body as any).blockMaxHp ?? null,
                    // Include dynamic data in full metadata too
                    position: { x: body.position.x, y: body.position.y },
                    angle: body.angle,
                    velocity: { x: body.velocity.x, y: body.velocity.y },
                    blockHp: (body as any).blockHp ?? null,
                });
                this.knownBodyIds.add(body.id);
            } else if (!body.isStatic) {
                // Known dynamic body: send only compact positional data
                // Rounding reduces JSON size and avoids false precision
                updates.push([
                    body.id,
                    Math.round(body.position.x * 10) / 10,
                    Math.round(body.position.y * 10) / 10,
                    Math.round(body.angle * 1000) / 1000,
                    Math.round(body.velocity.x * 10) / 10,
                    Math.round(body.velocity.y * 10) / 10,
                    (body as any).blockHp ?? -1,
                ]);
            }
            // Static known bodies: skip entirely (terrain, boundaries, foundations)
        }

        // Detect removed bodies
        const removed: number[] = [];
        for (const id of this.knownBodyIds) {
            if (!currentIds.has(id)) {
                removed.push(id);
                this.knownBodyIds.delete(id);
            }
        }

        const leftKing = this.kingStates.get('left');
        const rightKing = this.kingStates.get('right');

        this.io.to(this.roomId).emit('gameState', {
            // Compact delta-encoded payload
            u: updates,       // dynamic body updates (array tuples)
            n: newBodies,      // new/full-sync body metadata
            r: removed,        // removed body IDs
            t: Date.now(),     // timestamp
            k: {
                l: { hp: leftKing?.hp ?? 0, maxHp: leftKing?.maxHp ?? 0, x: leftKing?.position.x, y: leftKing?.position.y },
                r: { hp: rightKing?.hp ?? 0, maxHp: rightKing?.maxHp ?? 0, x: rightKing?.position.x, y: rightKing?.position.y },
            },
            f: isFullSync ? 1 : 0,  // full sync flag
        });
    }
}
