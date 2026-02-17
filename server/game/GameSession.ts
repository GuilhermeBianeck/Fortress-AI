import Matter from 'matter-js';
import { Server, Socket } from 'socket.io';
import { createWorld } from '../physics/world';
import { GameLoop } from '../physics/loop';
import { generateFortress } from '../ai/gemini';
import type { TerrainContext } from '../ai/prompts';
import { safeSpawn } from '../ai/overlap';
import type { KingState } from '../types';
import type { TerrainResult } from '../physics/terrain';
import {
    MATERIAL_PROPS, DAMAGE_MULTIPLIERS, MATERIAL_BLOCK_HP,
    KING_MAX_HP, IMPACT_THRESHOLD, DAMAGE_SCALE,
    PROJECTILE_RADIUS, PROJECTILE_DENSITY, PROJECTILE_RESTITUTION,
    PROJECTILE_FRICTION, PROJECTILE_LIFESPAN_MS,
    PROJECTILE_BLOCK_DAMAGE_MULT, PROJECTILE_MIN_IMPACT,
    CANVAS_WIDTH, CANVAS_HEIGHT,
} from '../config/constants';

export class GameSession {
    readonly id: string;
    private engine: Matter.Engine;
    private world: Matter.World;
    private terrain: TerrainResult & { seed: number };
    private kingBody: Matter.Body;
    private kingState: KingState;
    private gameLoop: GameLoop;
    private io: Server;
    private projectileTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();

    constructor(io: Server, seed?: number) {
        this.io = io;
        this.id = Math.random().toString(36).slice(2, 10);

        const ws = createWorld(seed);
        this.engine = ws.engine;
        this.world = ws.world;
        this.terrain = { ...ws.terrain, seed: ws.seed };

        const king = this.spawnKing();
        this.kingBody = king.body;
        this.kingState = king.state;

        this.setupCollisionHandlers();

        this.gameLoop = new GameLoop(this.engine, io, this.kingState);
        this.gameLoop.setOnTick(() => this.checkProjectileBounds());
        this.gameLoop.start();

        console.log(`GameSession created (seed: ${ws.seed})`);
    }

    // --- Public API (called by socket handlers) ---

    getTerrainData() {
        return {
            points: this.terrain.points,
            buildZones: this.terrain.buildZones,
            seed: this.terrain.seed,
        };
    }

    handleSpawn(data: { x: number; y: number; material?: string; shape?: string; dimensions?: number[] }) {
        const { x, y, material = 'wood', shape = 'rectangle', dimensions = [30, 30] } = data;
        console.log(`Spawn: ${shape} ${material} at (${x.toFixed(0)}, ${y.toFixed(0)})`);

        if (shape === 'circle') {
            const radius = dimensions[0] || 15;
            this.createBody('circle', material, x, y, [radius]);
        } else {
            const w = dimensions[0] || 30;
            const h = dimensions[1] || dimensions[0] || 30;
            this.createBody(shape as 'rectangle' | 'triangle', material, x, y, [w, h]);
        }
    }

    async handleRequestBuild(socket: Socket, data: { apiKey: string; prompt: string }) {
        const { apiKey, prompt } = data;

        if (!apiKey || !prompt) {
            socket.emit('build_error', { message: "Missing API Key or Prompt" });
            return;
        }

        try {
            socket.emit('build_status', { status: 'generating', message: 'Architect is thinking...' });

            const terrainCtx: TerrainContext = {
                surfacePoints: this.terrain.points,
                buildZones: this.terrain.buildZones,
                kingPosition: { x: this.kingBody.position.x, y: this.kingBody.position.y },
            };

            const plan = await generateFortress(apiKey, prompt, terrainCtx);

            socket.emit('build_status', { status: 'building', message: plan.thought_chain });

            const { adjustedBodies, adjustmentCount } = safeSpawn(plan.bodies, this.world);
            if (adjustmentCount > 0) {
                console.log(`Safe spawn adjusted ${adjustmentCount} bodies to avoid overlaps`);
            }

            let spawnedCount = 0;
            for (const b of adjustedBodies) {
                if (b.shape === 'circle') {
                    const radius = b.dimensions[0] || 15;
                    this.createBody('circle', b.material, b.x, b.y, [radius], b.angle);
                } else if (b.shape === 'triangle') {
                    const size = b.dimensions[0] || 30;
                    this.createBody('triangle', b.material, b.x, b.y, [size, size], b.angle);
                } else {
                    const w = b.dimensions[0] || 30;
                    const h = b.dimensions[1] || b.dimensions[0] || 30;
                    this.createBody('rectangle', b.material, b.x, b.y, [w, h], b.angle);
                }
                spawnedCount++;
            }

            socket.emit('build_success', { count: spawnedCount, thought: plan.thought_chain });
        } catch (err: any) {
            console.error("Build Error:", err);
            socket.emit('build_error', { message: err.message || "AI Generation Failed" });
        }
    }

    handleClearWorld() {
        // Clear all projectile timers
        for (const timer of this.projectileTimers.values()) {
            clearTimeout(timer);
        }
        this.projectileTimers.clear();

        // Remove all dynamic bodies except King
        const allBodies = Matter.Composite.allBodies(this.world);
        const dynamicBodies = allBodies.filter(b => !b.isStatic && b.id !== this.kingState.bodyId);
        Matter.Composite.remove(this.world, dynamicBodies);

        // Reset King HP and position
        this.kingState.hp = this.kingState.maxHp;

        const kingRadius = 12;
        const gap = 2;
        let resetX: number;

        if (this.terrain.buildZones.length > 0) {
            const zone = this.terrain.buildZones[0];
            resetX = zone.x + zone.width / 2;
        } else {
            resetX = 400;
        }

        const resetY = this.interpolateTerrainY(resetX) - kingRadius - gap;
        Matter.Body.setPosition(this.kingBody, { x: resetX, y: resetY });
        Matter.Body.setVelocity(this.kingBody, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(this.kingBody, 0);
        this.kingState.position = { x: this.kingBody.position.x, y: this.kingBody.position.y };
    }

    handleFireProjectile(data: { angle: number; power: number }) {
        // Clamp angle to [10deg, 170deg] in radians, power to [5, 30]
        const minAngle = (10 * Math.PI) / 180;
        const maxAngle = (170 * Math.PI) / 180;
        const angle = Math.max(minAngle, Math.min(maxAngle, data.angle));
        const power = Math.max(5, Math.min(30, data.power));

        // Cannon at x=20, interpolated terrain Y - 20
        const cannonY = this.interpolateTerrainY(20) - 20;
        const cannonX = 20;

        const body = Matter.Bodies.circle(cannonX, cannonY, PROJECTILE_RADIUS, {
            density: PROJECTILE_DENSITY,
            restitution: PROJECTILE_RESTITUTION,
            friction: PROJECTILE_FRICTION,
            label: 'projectile',
        });

        Matter.World.add(this.world, body);
        Matter.Body.setVelocity(body, {
            x: power * Math.cos(angle),
            y: -power * Math.sin(angle),
        });

        // Auto-remove after lifespan
        const timer = setTimeout(() => this.removeProjectile(body), PROJECTILE_LIFESPAN_MS);
        this.projectileTimers.set(body.id, timer);

        console.log(`Projectile fired: angle=${(angle * 180 / Math.PI).toFixed(1)}deg power=${power.toFixed(1)}`);
    }

    destroy() {
        this.gameLoop.stop();
        for (const timer of this.projectileTimers.values()) {
            clearTimeout(timer);
        }
        this.projectileTimers.clear();
    }

    // --- Private ---

    private spawnKing(): { body: Matter.Body; state: KingState } {
        const kingRadius = 12;
        const gap = 2;
        let spawnX: number;

        if (this.terrain.buildZones.length > 0) {
            const zone = this.terrain.buildZones[0];
            spawnX = zone.x + zone.width / 2;
        } else {
            spawnX = 400;
        }

        const spawnY = this.interpolateTerrainY(spawnX) - kingRadius - gap;

        const body = Matter.Bodies.circle(spawnX, spawnY, kingRadius, {
            density: 0.003,
            restitution: 0.5,
            friction: 0.5,
            label: 'king',
        });

        Matter.World.add(this.world, body);

        const state: KingState = {
            bodyId: body.id,
            hp: KING_MAX_HP,
            maxHp: KING_MAX_HP,
            position: { x: body.position.x, y: body.position.y },
        };

        return { body, state };
    }

    private createBody(
        shape: 'rectangle' | 'circle' | 'triangle',
        material: string,
        x: number, y: number,
        dimensions: number[],
        angle?: number,
    ): Matter.Body {
        const props = MATERIAL_PROPS[material] || MATERIAL_PROPS.wood;
        let body: Matter.Body;

        if (shape === 'circle') {
            const radius = dimensions[0] || 15;
            body = Matter.Bodies.circle(x, y, radius, {
                density: props.density,
                friction: props.friction,
                restitution: props.restitution,
                label: material,
            });
        } else if (shape === 'triangle') {
            const size = dimensions[0] || 30;
            const vertices = [
                { x: 0, y: -size / 2 },
                { x: -size / 2, y: size / 2 },
                { x: size / 2, y: size / 2 },
            ];
            body = Matter.Bodies.fromVertices(x, y, [vertices], {
                density: props.density,
                friction: props.friction,
                restitution: props.restitution,
                label: material,
            });
            this.stampBlockProps(body, material, size, size);
        } else {
            const w = dimensions[0] || 30;
            const h = dimensions[1] || dimensions[0] || 30;
            body = Matter.Bodies.rectangle(x, y, w, h, {
                density: props.density,
                friction: props.friction,
                restitution: props.restitution,
                label: material,
            });
            this.stampBlockProps(body, material, w, h);
        }

        if (angle) Matter.Body.setAngle(body, angle);
        Matter.World.add(this.world, body);
        return body;
    }

    private stampBlockProps(body: Matter.Body, material: string, w: number, h: number) {
        (body as any).originalWidth = w;
        (body as any).originalHeight = h;
        const hp = MATERIAL_BLOCK_HP[material] ?? null;
        (body as any).blockHp = hp;
        (body as any).blockMaxHp = hp;
    }

    private setupCollisionHandlers() {
        Matter.Events.on(this.engine, 'collisionStart', (event) => {
            for (const pair of event.pairs) {
                const { bodyA, bodyB } = pair;

                // --- King damage from any collision ---
                let kingHit = false;
                let otherBody: Matter.Body | null = null;
                if (bodyA.id === this.kingState.bodyId) { otherBody = bodyB; kingHit = true; }
                else if (bodyB.id === this.kingState.bodyId) { otherBody = bodyA; kingHit = true; }

                if (kingHit && otherBody && this.kingState.hp > 0) {
                    const getMomentum = (b: Matter.Body) => b.isStatic ? 0 : b.speed * b.mass;
                    const impactForce = getMomentum(bodyA) + getMomentum(bodyB);
                    if (impactForce >= IMPACT_THRESHOLD && !isNaN(impactForce)) {
                        const multiplier = DAMAGE_MULTIPLIERS[otherBody.label] ?? 1.0;
                        const damage = ((impactForce - IMPACT_THRESHOLD) * multiplier) * DAMAGE_SCALE;
                        this.kingState.hp = Math.max(0, this.kingState.hp - damage);
                        this.kingState.position = { x: this.kingBody.position.x, y: this.kingBody.position.y };

                        console.log(`King hit by ${otherBody.label} | force=${impactForce.toFixed(1)} | damage=${damage.toFixed(1)} | HP=${this.kingState.hp.toFixed(1)}/${this.kingState.maxHp}`);

                        this.io.emit('king_damage', {
                            hp: this.kingState.hp,
                            maxHp: this.kingState.maxHp,
                            damage,
                            source: otherBody.label,
                        });

                        if (this.kingState.hp <= 0) {
                            console.log('King is dead!');
                            this.io.emit('king_dead');
                        }
                    }
                }

                // --- Projectile vs block damage ---
                let projectile: Matter.Body | null = null;
                let block: Matter.Body | null = null;

                if (bodyA.label === 'projectile' && bodyB.label !== 'projectile') {
                    projectile = bodyA;
                    block = bodyB;
                } else if (bodyB.label === 'projectile' && bodyA.label !== 'projectile') {
                    projectile = bodyB;
                    block = bodyA;
                }

                if (projectile && block) {
                    // Emit impact for any non-terrain hit
                    if (block.label !== 'Terrain') {
                        this.io.emit('projectile_impact', {
                            position: { x: projectile.position.x, y: projectile.position.y },
                        });
                    }

                    // Block HP damage (skip terrain, king, other projectiles)
                    const blockHp = (block as any).blockHp;
                    if (blockHp != null && block.label !== 'Terrain' && block.label !== 'king') {
                        const impactForce = projectile.speed * projectile.mass;
                        if (impactForce >= PROJECTILE_MIN_IMPACT) {
                            const blockDamage = impactForce * PROJECTILE_BLOCK_DAMAGE_MULT;
                            (block as any).blockHp = Math.max(0, blockHp - blockDamage);

                            if ((block as any).blockHp <= 0) {
                                this.io.emit('block_destroyed', {
                                    bodyId: block.id,
                                    position: { x: block.position.x, y: block.position.y },
                                    material: block.label,
                                    velocity: { x: block.velocity.x, y: block.velocity.y },
                                });
                                Matter.Composite.remove(this.world, block);
                            }
                        }
                    }
                }
            }
        });
    }

    private interpolateTerrainY(x: number): number {
        const pts = this.terrain.points;
        for (let i = 0; i < pts.length - 1; i++) {
            if (pts[i].x <= x && pts[i + 1].x >= x) {
                const t = (x - pts[i].x) / (pts[i + 1].x - pts[i].x);
                return pts[i].y + t * (pts[i + 1].y - pts[i].y);
            }
        }
        return pts[pts.length - 1].y;
    }

    private checkProjectileBounds() {
        const bodies = Matter.Composite.allBodies(this.world);
        for (const body of bodies) {
            if (body.label !== 'projectile') continue;
            if (body.position.y > CANVAS_HEIGHT + 50 ||
                body.position.x < -50 ||
                body.position.x > CANVAS_WIDTH + 50) {
                this.removeProjectile(body);
            }
        }
    }

    private removeProjectile(body: Matter.Body) {
        // Check if body is still in the world
        const bodies = Matter.Composite.allBodies(this.world);
        if (bodies.includes(body)) {
            Matter.Composite.remove(this.world, body);
        }

        const timer = this.projectileTimers.get(body.id);
        if (timer) {
            clearTimeout(timer);
            this.projectileTimers.delete(body.id);
        }

        this.io.emit('projectile_removed', { bodyId: body.id });
    }
}
