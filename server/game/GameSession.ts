import Matter from 'matter-js';
import { Server, Socket } from 'socket.io';
import { createWorld } from '../physics/world';
import { GameLoop } from '../physics/loop';
import { generateFortress } from '../ai/gemini';
import type { TerrainContext } from '../ai/prompts';
import { safeSpawn } from '../ai/overlap';
import type { KingState, PlayerInfo, PlayerState, Side, KingHpState, MatchPhase, HazardData, MatchScores } from '../types';
import type { TerrainResult } from '../physics/terrain';
import { MatchStateMachine } from './MatchStateMachine';
import { ScoreManager } from './ScoreManager';
import {
    MATERIAL_PROPS, DAMAGE_MULTIPLIERS, MATERIAL_BLOCK_HP,
    KING_MAX_HP, IMPACT_THRESHOLD, DAMAGE_SCALE,
    PROJECTILE_RADIUS, PROJECTILE_DENSITY, PROJECTILE_RESTITUTION,
    PROJECTILE_FRICTION, PROJECTILE_LIFESPAN_MS,
    PROJECTILE_BLOCK_DAMAGE_MULT, PROJECTILE_MIN_IMPACT,
    WORLD_WIDTH, CANVAS_HEIGHT,
    LEFT_SIDE, RIGHT_SIDE, LEFT_CANNON_X, RIGHT_CANNON_X,
    FALLING_ROCK_INTERVAL_MS, FALLING_ROCK_RADIUS,
    COL_BLOCK, SHAPE_DIMS,
} from '../config/constants';
import { generateHazards, applyWindForce, checkLavaDamage } from '../physics/hazards';

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
    private onRoundEndCallback?: (winner: Side, reason: string) => 'continue' | 'match_over';
    private hazards: HazardData[] = [];
    private hazardTimers: ReturnType<typeof setInterval>[] = [];
    private scoreManager: ScoreManager = new ScoreManager();

    constructor(io: Server, roomId: string, playerInfos: PlayerInfo[], seed?: number, onPhaseChange?: (phase: MatchPhase) => void, onRoundEnd?: (winner: Side, reason: string) => 'continue' | 'match_over') {
        this.onPhaseChangeCallback = onPhaseChange;
        this.onRoundEndCallback = onRoundEnd;
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
        this.gameLoop.setOnTick(() => {
            this.checkProjectileBounds();
            this.tickHazards();
        });
        this.gameLoop.start();

        // Create state machine
        this.stateMachine = new MatchStateMachine(io, roomId, {
            onPhaseChange: (phase) => {
                this.onPhaseChangeCallback?.(phase);
                if (phase === 'combat') {
                    this.scoreManager.startCombatTimer();
                    this.startFallingRocks();
                }
            },
            onTurnStart: (_side) => { /* UI updates via socket events */ },
            onMatchResult: (_winner, _reason) => { /* Room manager handles result */ },
            onRoundEnd: (winner, reason) => {
                return this.onRoundEndCallback?.(winner, reason) ?? 'match_over';
            },
            getKingState: (side: Side) => this.getKingStateBySide(side),
            getWorld: () => this.world,
        });

        // Generate hazards
        this.hazards = generateHazards(this.terrain, ws.seed);
        if (this.hazards.length > 0) {
            console.log(`Hazards: ${this.hazards.map(h => h.type).join(', ')}`);
        }

        console.log(`GameSession created for room ${roomId} (seed: ${ws.seed})`);
    }

    // --- Public API ---

    getStateMachine(): MatchStateMachine {
        return this.stateMachine;
    }

    getScoreManager(): ScoreManager {
        return this.scoreManager;
    }

    computeMatchScores(winner: Side): MatchScores {
        this.scoreManager.stopCombatTimer();
        return this.scoreManager.computeScores(winner);
    }

    getTerrainData() {
        return {
            points: this.terrain.points,
            buildZones: this.terrain.buildZones,
            seed: this.terrain.seed,
            hazards: this.hazards,
        };
    }

    setHazards(hazards: HazardData[]): void {
        this.hazards = hazards;
    }

    getWorld(): Matter.World {
        return this.world;
    }

    getTerrain() {
        return this.terrain;
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

        const { x, y, material = 'wood', shape = 'rectangle' } = data;

        // Validate within player's half
        if (x < player.buildZone.xMin || x > player.buildZone.xMax) return;

        // Use predefined shape dimensions
        const dims = SHAPE_DIMS[shape] || SHAPE_DIMS.rectangle;
        const w = dims[0];
        const h = dims[1];

        console.log(`Spawn: ${shape} ${material} at (${x.toFixed(0)}, ${y.toFixed(0)}) dims=${w}x${h} by ${player.side}`);

        this.createBody('rectangle', material, x, y, [w, h]);
        this.scoreManager.recordResourceUsed(player.side);
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
            this.scoreManager.recordResourceUsed(player.side, spawnedCount);
        } catch (err: any) {
            console.error("Build Error:", err);
            socket.emit('build_error', { message: err.message || "AI Generation Failed" });
        }
    }

    handleFireProjectile(socketId: string, data: { angle: number; power: number }) {
        if (!this.stateMachine.canFire()) return;

        const player = this.players.get(socketId);
        if (!player) return;

        // Only the current turn's player can fire
        if (player.side !== this.stateMachine.getCurrentTurn()) return;

        // Clamp angle to [10deg, 170deg] in radians, power to [5, 50]
        const minAngle = (10 * Math.PI) / 180;
        const maxAngle = (170 * Math.PI) / 180;
        const angle = Math.max(minAngle, Math.min(maxAngle, data.angle));
        const power = Math.max(5, Math.min(50, data.power));

        // Cannon position based on player's side
        const cannonX = player.cannonX;
        const cannonY = this.interpolateTerrainY(cannonX) - 20;

        const body = Matter.Bodies.circle(cannonX, cannonY, PROJECTILE_RADIUS, {
            density: PROJECTILE_DENSITY,
            restitution: PROJECTILE_RESTITUTION,
            friction: PROJECTILE_FRICTION,
            frictionAir: 0.005,
            label: 'projectile',
        });

        // Enable CCD to prevent tunneling through terrain
        (body as any).isBullet = true;

        Matter.World.add(this.world, body);

        // Right player fires leftward (mirror velocity)
        const directionMultiplier = player.side === 'right' ? -1 : 1;
        const vx = directionMultiplier * power * Math.cos(angle);
        const vy = -power * Math.sin(angle);

        // Cap velocity magnitude to prevent tunneling
        const maxSpeed = 45;
        const speed = Math.sqrt(vx * vx + vy * vy);
        const scale = speed > maxSpeed ? maxSpeed / speed : 1;
        Matter.Body.setVelocity(body, {
            x: vx * scale,
            y: vy * scale,
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
        for (const timer of this.hazardTimers) {
            clearInterval(timer);
        }
        this.hazardTimers = [];
    }

    startFallingRocks(): void {
        const rockHazards = this.hazards.filter(h => h.type === 'falling_rocks');
        if (rockHazards.length === 0) return;

        const interval = setInterval(() => {
            if (this.stateMachine.getPhase() !== 'combat') return;

            for (const hazard of rockHazards) {
                const rx = hazard.position.x + Math.random() * hazard.width;
                const ry = 0;

                const rock = Matter.Bodies.circle(rx, ry, FALLING_ROCK_RADIUS, {
                    density: 0.03,
                    restitution: 0.2,
                    friction: 0.5,
                    label: 'stone',
                });
                this.stampBlockProps(rock, 'stone', FALLING_ROCK_RADIUS * 2, FALLING_ROCK_RADIUS * 2);

                Matter.World.add(this.world, rock);
                Matter.Body.setVelocity(rock, { x: 0, y: 3 });
            }
        }, FALLING_ROCK_INTERVAL_MS);
        this.hazardTimers.push(interval);
    }

    private tickHazards(): void {
        if (this.hazards.length === 0) return;

        // Wind
        applyWindForce(this.world, this.hazards);

        // Lava
        const kingsMap = new Map<Side, KingState>();
        for (const ps of this.players.values()) {
            kingsMap.set(ps.side, ps.kingState);
        }
        checkLavaDamage(this.world, this.hazards, kingsMap, (side, damage) => {
            const ps = this.getPlayerBySide(side);
            if (ps) {
                this.io.to(this.roomId).emit('king_damage', {
                    side,
                    hp: ps.kingState.hp,
                    maxHp: ps.kingState.maxHp,
                    damage,
                    source: 'lava',
                });
            }
        });
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

        const bodyOpts: Matter.IChamferableBodyDefinition = {
            density: props.density,
            friction: props.friction,
            frictionStatic: props.frictionStatic,
            restitution: props.restitution,
            label: material,
            collisionFilter: {
                category: COL_BLOCK,
                mask: 0xFFFFFFFF, // collide with everything (including divider)
            },
        };

        if (shape === 'circle') {
            const radius = dimensions[0] || 15;
            body = Matter.Bodies.circle(x, y, radius, bodyOpts);
        } else if (shape === 'triangle') {
            const size = dimensions[0] || 30;
            const vertices = [
                { x: 0, y: -size / 2 },
                { x: -size / 2, y: size / 2 },
                { x: size / 2, y: size / 2 },
            ];
            body = Matter.Bodies.fromVertices(x, y, [vertices], bodyOpts);
            this.stampBlockProps(body, material, size, size);
        } else {
            const w = dimensions[0] || 30;
            const h = dimensions[1] || dimensions[0] || 30;
            body = Matter.Bodies.rectangle(x, y, w, h, bodyOpts);
            this.stampBlockProps(body, material, w, h);
        }

        // Blocks spawn upright and resist rotation (high inertia)
        Matter.Body.setAngle(body, angle ?? 0);
        Matter.Body.setInertia(body, body.inertia * 200);

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

                            // Record damage for scoring (attacker is the opposite side)
                            const attackerSide: Side = ps.side === 'left' ? 'right' : 'left';
                            this.scoreManager.recordDamage(attackerSide, damage);

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
        const tickMaxSpeed = 25;
        for (const body of bodies) {
            if (body.label !== 'projectile') continue;
            if (body.position.y > CANVAS_HEIGHT + 50 ||
                body.position.x < -50 ||
                body.position.x > WORLD_WIDTH + 50) {
                this.removeProjectile(body);
                continue;
            }
            // Per-tick speed cap to prevent gravity-accelerated tunneling
            const spd = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
            if (spd > tickMaxSpeed) {
                const s = tickMaxSpeed / spd;
                Matter.Body.setVelocity(body, {
                    x: body.velocity.x * s,
                    y: body.velocity.y * s,
                });
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
