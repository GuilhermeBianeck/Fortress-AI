import Matter from 'matter-js';
import { Server, Socket } from 'socket.io';
import { createWorld } from '../physics/world';
import { GameLoop } from '../physics/loop';
import { generateFortress } from '../ai/gemini';
import type { TerrainContext } from '../ai/prompts';
import { safeSpawn } from '../ai/overlap';
import type { KingState, PlayerInfo, PlayerState, Side, KingHpState, MatchPhase } from '../types';
import type { TerrainResult } from '../physics/terrain';
import { MatchStateMachine } from './MatchStateMachine';
import {
    MATERIAL_PROPS, DAMAGE_MULTIPLIERS, MATERIAL_BLOCK_HP,
    KING_MAX_HP, IMPACT_THRESHOLD, DAMAGE_SCALE,
    PROJECTILE_RADIUS, PROJECTILE_DENSITY, PROJECTILE_RESTITUTION,
    PROJECTILE_FRICTION, PROJECTILE_LIFESPAN_MS,
    PROJECTILE_BLOCK_DAMAGE_MULT, PROJECTILE_MIN_IMPACT,
    WORLD_WIDTH, CANVAS_HEIGHT,
    LEFT_SIDE, RIGHT_SIDE, LEFT_CANNON_X, RIGHT_CANNON_X,
} from '../config/constants';

export class GameSession {
    readonly id: string;
    private engine: Matter.Engine;
    private world: Matter.World;
    private terrain: TerrainResult & { seed: number };
    private players: Map<string, PlayerState> = new Map(); // socketId → PlayerState
    private gameLoop: GameLoop;
    private io: Server;
    private roomId: string;
    private projectileTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
    private stateMachine: MatchStateMachine;
    private onPhaseChangeCallback?: (phase: MatchPhase) => void;

    constructor(io: Server, roomId: string, playerInfos: PlayerInfo[], seed?: number, onPhaseChange?: (phase: MatchPhase) => void) {
        this.onPhaseChangeCallback = onPhaseChange;
        this.io = io;
        this.roomId = roomId;
        this.id = roomId;

        const ws = createWorld(seed);
        this.engine = ws.engine;
        this.world = ws.world;
        this.terrain = { ...ws.terrain, seed: ws.seed };

        // Spawn kings for each player
        for (const info of playerInfos) {
            const sideBounds = info.side === 'left' ? LEFT_SIDE : RIGHT_SIDE;
            const cannonX = info.side === 'left' ? LEFT_CANNON_X : RIGHT_CANNON_X;

            const king = this.spawnKing(info.side, sideBounds);

            const playerState: PlayerState = {
                socketId: info.socketId,
                side: info.side,
                kingBody: king.body,
                kingState: king.state,
                cannonX,
                buildZone: { xMin: sideBounds.min, xMax: sideBounds.max },
            };

            this.players.set(info.socketId, playerState);
        }

        this.setupCollisionHandlers();

        this.gameLoop = new GameLoop(this.engine, io, roomId);
        for (const ps of this.players.values()) {
            this.gameLoop.setKingState(ps.side, ps.kingState);
        }
        this.gameLoop.setOnTick(() => this.checkProjectileBounds());
        this.gameLoop.start();

        // Create state machine
        this.stateMachine = new MatchStateMachine(io, roomId, {
            onPhaseChange: (phase) => { this.onPhaseChangeCallback?.(phase); },
            onTurnStart: (_side) => { /* UI updates via socket events */ },
            onMatchResult: (_winner, _reason) => { /* Room manager handles result */ },
            getKingState: (side: Side) => this.getKingStateBySide(side),
            getWorld: () => this.world,
        });

        console.log(`GameSession created for room ${roomId} (seed: ${ws.seed})`);
    }

    // --- Public API ---

    getStateMachine(): MatchStateMachine {
        return this.stateMachine;
    }

    getTerrainData() {
        return {
            points: this.terrain.points,
            buildZones: this.terrain.buildZones,
            seed: this.terrain.seed,
        };
    }

    getKingsHp(): { left: KingHpState; right: KingHpState } {
        let left: KingHpState = { hp: 0, maxHp: 0 };
        let right: KingHpState = { hp: 0, maxHp: 0 };
        for (const ps of this.players.values()) {
            if (ps.side === 'left') left = { hp: ps.kingState.hp, maxHp: ps.kingState.maxHp };
            if (ps.side === 'right') right = { hp: ps.kingState.hp, maxHp: ps.kingState.maxHp };
        }
        return { left, right };
    }

    getPlayerState(socketId: string): PlayerState | undefined {
        return this.players.get(socketId);
    }

    getPlayerBySide(side: Side): PlayerState | undefined {
        for (const ps of this.players.values()) {
            if (ps.side === side) return ps;
        }
        return undefined;
    }

    handleSpawn(socketId: string, data: { x: number; y: number; material?: string; shape?: string; dimensions?: number[] }) {
        const phase = this.stateMachine.getPhase();
        if (phase !== 'build') return;

        const player = this.players.get(socketId);
        if (!player) return;

        const { x, y, material = 'wood', shape = 'rectangle', dimensions = [30, 30] } = data;

        // Validate within player's half
        if (x < player.buildZone.xMin || x > player.buildZone.xMax) return;

        console.log(`Spawn: ${shape} ${material} at (${x.toFixed(0)}, ${y.toFixed(0)}) by ${player.side}`);

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
        const phase = this.stateMachine.getPhase();
        if (phase !== 'build') {
            socket.emit('build_error', { message: 'Building is only allowed during the build phase.' });
            return;
        }

        const player = this.players.get(socket.id);
        if (!player) return;

        const { apiKey, prompt } = data;
        if (!apiKey || !prompt) {
            socket.emit('build_error', { message: "Missing API Key or Prompt" });
            return;
        }

        try {
            socket.emit('build_status', { status: 'generating', message: 'Architect is thinking...' });

            // Filter terrain context to player's half
            const terrainCtx: TerrainContext = {
                surfacePoints: this.terrain.points,
                buildZones: this.terrain.buildZones,
                kingPosition: { x: player.kingBody.position.x, y: player.kingBody.position.y },
                side: player.side,
                sideXMin: player.buildZone.xMin,
                sideXMax: player.buildZone.xMax,
            };

            const plan = await generateFortress(apiKey, prompt, terrainCtx);

            socket.emit('build_status', { status: 'building', message: plan.thought_chain });

            // Clamp AI bodies to player's half
            const clampedPlans = plan.bodies.map(b => ({
                ...b,
                x: Math.max(player.buildZone.xMin + 5, Math.min(player.buildZone.xMax - 5, b.x)),
            }));

            const { adjustedBodies, adjustmentCount } = safeSpawn(clampedPlans, this.world);
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

    handleFireProjectile(socketId: string, data: { angle: number; power: number }) {
        const phase = this.stateMachine.getPhase();
        if (phase !== 'combat') return;

        const player = this.players.get(socketId);
        if (!player) return;

        // Only the current turn's player can fire
        if (player.side !== this.stateMachine.getCurrentTurn()) return;

        // Clamp angle to [10deg, 170deg] in radians, power to [5, 30]
        const minAngle = (10 * Math.PI) / 180;
        const maxAngle = (170 * Math.PI) / 180;
        const angle = Math.max(minAngle, Math.min(maxAngle, data.angle));
        const power = Math.max(5, Math.min(30, data.power));

        // Cannon position based on player's side
        const cannonX = player.cannonX;
        const cannonY = this.interpolateTerrainY(cannonX) - 20;

        const body = Matter.Bodies.circle(cannonX, cannonY, PROJECTILE_RADIUS, {
            density: PROJECTILE_DENSITY,
            restitution: PROJECTILE_RESTITUTION,
            friction: PROJECTILE_FRICTION,
            label: 'projectile',
        });

        Matter.World.add(this.world, body);

        // Right player fires leftward (mirror velocity)
        const directionMultiplier = player.side === 'right' ? -1 : 1;
        Matter.Body.setVelocity(body, {
            x: directionMultiplier * power * Math.cos(angle),
            y: -power * Math.sin(angle),
        });

        // Auto-remove after lifespan
        const timer = setTimeout(() => this.removeProjectile(body), PROJECTILE_LIFESPAN_MS);
        this.projectileTimers.set(body.id, timer);

        console.log(`Projectile fired by ${player.side}: angle=${(angle * 180 / Math.PI).toFixed(1)}deg power=${power.toFixed(1)}`);

        // Tell state machine a projectile was fired, wait for settle
        this.stateMachine.onProjectileFired();
        this.stateMachine.waitForSettle();
    }

    handlePlayerBuildReady(socketId: string): void {
        this.stateMachine.handlePlayerBuildReady(socketId);
    }

    handleForfeit(disconnectedSocketId: string): void {
        // Stop the game loop and state machine
        this.stateMachine.destroy();
    }

    destroy() {
        this.gameLoop.stop();
        this.stateMachine.destroy();
        for (const timer of this.projectileTimers.values()) {
            clearTimeout(timer);
        }
        this.projectileTimers.clear();
    }

    // --- Private ---

    private getKingStateBySide(side: Side): KingState {
        for (const ps of this.players.values()) {
            if (ps.side === side) return ps.kingState;
        }
        // Fallback (shouldn't happen)
        return { bodyId: -1, hp: 0, maxHp: 0, position: { x: 0, y: 0 } };
    }

    private spawnKing(side: Side, sideBounds: { min: number; max: number }): { body: Matter.Body; state: KingState } {
        const kingRadius = 12;
        const gap = 2;

        // Find a build zone within this side
        const sideZones = this.terrain.buildZones.filter(
            z => z.x >= sideBounds.min && z.x + z.width <= sideBounds.max
        );

        let spawnX: number;
        if (sideZones.length > 0) {
            const zone = sideZones[0];
            spawnX = zone.x + zone.width / 2;
        } else {
            // Fallback: center of side
            spawnX = (sideBounds.min + sideBounds.max) / 2;
        }

        const spawnY = this.interpolateTerrainY(spawnX) - kingRadius - gap;

        const body = Matter.Bodies.circle(spawnX, spawnY, kingRadius, {
            density: 0.003,
            restitution: 0.5,
            friction: 0.5,
            label: 'king',
        });

        // Tag with side for collision identification
        (body as any).side = side;

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

                // --- King damage from any collision (check BOTH kings) ---
                for (const ps of this.players.values()) {
                    let kingHit = false;
                    let otherBody: Matter.Body | null = null;

                    if (bodyA.id === ps.kingState.bodyId) { otherBody = bodyB; kingHit = true; }
                    else if (bodyB.id === ps.kingState.bodyId) { otherBody = bodyA; kingHit = true; }

                    if (kingHit && otherBody && ps.kingState.hp > 0) {
                        const getMomentum = (b: Matter.Body) => b.isStatic ? 0 : b.speed * b.mass;
                        const impactForce = getMomentum(bodyA) + getMomentum(bodyB);
                        if (impactForce >= IMPACT_THRESHOLD && !isNaN(impactForce)) {
                            const multiplier = DAMAGE_MULTIPLIERS[otherBody.label] ?? 1.0;
                            const damage = ((impactForce - IMPACT_THRESHOLD) * multiplier) * DAMAGE_SCALE;
                            ps.kingState.hp = Math.max(0, ps.kingState.hp - damage);
                            ps.kingState.position = { x: ps.kingBody.position.x, y: ps.kingBody.position.y };

                            console.log(`${ps.side} King hit by ${otherBody.label} | force=${impactForce.toFixed(1)} | damage=${damage.toFixed(1)} | HP=${ps.kingState.hp.toFixed(1)}/${ps.kingState.maxHp}`);

                            this.io.to(this.roomId).emit('king_damage', {
                                side: ps.side,
                                hp: ps.kingState.hp,
                                maxHp: ps.kingState.maxHp,
                                damage,
                                source: otherBody.label,
                            });

                            if (ps.kingState.hp <= 0) {
                                console.log(`${ps.side} King is dead!`);
                                this.io.to(this.roomId).emit('king_dead', { side: ps.side });
                            }
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
                        this.io.to(this.roomId).emit('projectile_impact', {
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
                                this.io.to(this.roomId).emit('block_destroyed', {
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
                body.position.x > WORLD_WIDTH + 50) {
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

        this.io.to(this.roomId).emit('projectile_removed', { bodyId: body.id });
    }
}
