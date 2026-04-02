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
import { BotAI } from './BotAI';
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
    PHYSICS_MAX_SPEED, PHYSICS_POWER_MULTIPLIER, PHYSICS_AIR_FRICTION,
} from '../config/constants';
import { generateHazards, applyWindForce, checkLavaDamage } from '../physics/hazards';

/** Matter.js Body extended with custom game properties */
interface GameBody extends Matter.Body {
    blockHp?: number | null;
    blockMaxHp?: number | null;
    originalWidth?: number;
    originalHeight?: number;
    isBullet?: boolean;
    side?: Side;
}

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
    private projectileBodies: Set<Matter.Body> = new Set();
    private kingsMap: Map<Side, KingState> = new Map();
    private stateMachine: MatchStateMachine;
    private onPhaseChangeCallback?: (phase: MatchPhase) => void;
    private onRoundEndCallback?: (winner: Side, reason: string) => 'continue' | 'match_over';
    private hazards: HazardData[] = [];
    private windHazards: HazardData[] = [];
    private lavaHazards: HazardData[] = [];
    private hazardTimers: ReturnType<typeof setInterval>[] = [];
    private scoreManager: ScoreManager = new ScoreManager();
    private botAI: BotAI | null = null;
    private hazardTickCounter = 0;
    private leftPlayer: PlayerState | null = null;
    private rightPlayer: PlayerState | null = null;

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
            if (playerState.side === 'left') this.leftPlayer = playerState;
            else if (playerState.side === 'right') this.rightPlayer = playerState;
        }

        // Pre-build kingsMap for use in tickHazards (avoids per-tick allocation)
        for (const ps of this.players.values()) {
            this.kingsMap.set(ps.side, ps.kingState);
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
                if (phase === 'build' && this.botAI) {
                    this.botAI.buildFortress();
                }
            },
            onTurnStart: (side) => {
                if (this.botAI && this.getBotPlayer()?.side === side) {
                    this.botAI.takeTurn();
                }
            },
            onMatchResult: () => { /* Room manager handles result */ },
            onRoundEnd: (winner, reason) => {
                return this.onRoundEndCallback?.(winner, reason) ?? 'match_over';
            },
            getKingState: (side: Side) => this.getKingStateBySide(side),
            getWorld: () => this.world,
        });

        // Initialize BotAI if there's a bot player
        const botPlayer = this.getBotPlayer();
        if (botPlayer) {
            const botSide = botPlayer.side;
            const opponentSide: Side = botSide === 'left' ? 'right' : 'left';
            this.botAI = new BotAI(botSide, {
                getKingPosition: () => {
                    const ps = this.getPlayerBySide(botSide);
                    return ps ? { x: ps.kingBody.position.x, y: ps.kingBody.position.y } : { x: 0, y: 0 };
                },
                getFoundationTopY: () => {
                    const ps = this.getPlayerBySide(botSide);
                    if (!ps) return 0;
                    return this.getFoundationTopY(ps.kingBody.position.x);
                },
                getOpponentKingPosition: () => {
                    const ps = this.getPlayerBySide(opponentSide);
                    return ps ? { x: ps.kingBody.position.x, y: ps.kingBody.position.y } : { x: 0, y: 0 };
                },
                spawnBlock: (shape, material, x, y, width, height) => {
                    this.createBody(shape, material, x, y, [width, height]);
                },
                fireProjectile: (side, angle, power) => {
                    this.fireProjectile(side, angle, power);
                },
            });
        }

        // Generate hazards
        this.hazards = generateHazards(this.terrain, ws.seed);
        this.windHazards = this.hazards.filter(h => h.type === 'wind_zone');
        this.lavaHazards = this.hazards.filter(h => h.type === 'lava_pool');
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
        this.windHazards = this.hazards.filter(h => h.type === 'wind_zone');
        this.lavaHazards = this.hazards.filter(h => h.type === 'lava_pool');
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
            if (ps.side === 'left') left = { hp: ps.kingState.hp, maxHp: ps.kingState.maxHp, x: ps.kingBody.position.x, y: ps.kingBody.position.y };
            if (ps.side === 'right') right = { hp: ps.kingState.hp, maxHp: ps.kingState.maxHp, x: ps.kingBody.position.x, y: ps.kingBody.position.y };
        }
        return { left, right };
    }

    getPlayerState(socketId: string): PlayerState | undefined {
        return this.players.get(socketId);
    }

    getPlayerBySide(side: Side): PlayerState | undefined {
        if (side === 'left') return this.leftPlayer ?? undefined;
        if (side === 'right') return this.rightPlayer ?? undefined;
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
            this.scoreManager.recordAIBuild(player.side, spawnedCount);
        } catch (err: unknown) {
            console.error("Build Error:", err);
            const message = err instanceof Error ? err.message : "AI Generation Failed";
            socket.emit('build_error', { message });
        }
    }

    handleFireProjectile(socketId: string, data: { angle?: unknown; power?: unknown }) {
        if (!this.stateMachine.canFire()) return;

        const player = this.players.get(socketId);
        if (!player) return;

        // Only the current turn's player can fire
        if (player.side !== this.stateMachine.getCurrentTurn()) return;

        if (typeof data.angle !== 'number' || !Number.isFinite(data.angle) ||
            typeof data.power !== 'number' || !Number.isFinite(data.power)) {
            return;
        }

        this.fireProjectile(player.side, data.angle, data.power);
    }

    fireProjectile(side: Side, rawAngle: number, rawPower: number): void {
        if (!this.stateMachine.canFire()) return;
        if (!Number.isFinite(rawAngle) || !Number.isFinite(rawPower)) return;

        const player = this.getPlayerBySide(side);
        if (!player) return;

        // Clamp angle to [10deg, 170deg] in radians, power to [5, 100]
        const minAngle = (10 * Math.PI) / 180;
        const maxAngle = (170 * Math.PI) / 180;
        const angle = Math.max(minAngle, Math.min(maxAngle, rawAngle));
        // Ensure power is capped at 100
        const power = Math.max(5, Math.min(100, rawPower));

        // Cannon position based on player's side
        const cannonX = player.cannonX;
        const cannonY = this.interpolateTerrainY(cannonX) - 20;

        const body = Matter.Bodies.circle(cannonX, cannonY, PROJECTILE_RADIUS, {
            density: PROJECTILE_DENSITY,
            restitution: PROJECTILE_RESTITUTION,
            friction: PROJECTILE_FRICTION,
            frictionAir: PHYSICS_AIR_FRICTION,
            label: 'projectile',
        });

        // Enable CCD to prevent tunneling through terrain
        (body as GameBody).isBullet = true;

        Matter.World.add(this.world, body);

        // Right player fires leftward (mirror velocity)
        const directionMultiplier = side === 'right' ? -1 : 1;
        const vx = directionMultiplier * (power * PHYSICS_POWER_MULTIPLIER) * Math.cos(angle);
        const vy = -(power * PHYSICS_POWER_MULTIPLIER) * Math.sin(angle);

        // Cap velocity magnitude to prevent tunneling
        const maxSpeed = PHYSICS_MAX_SPEED;
        const speed = Math.sqrt(vx * vx + vy * vy);
        const scale = speed > maxSpeed ? maxSpeed / speed : 1;
        Matter.Body.setVelocity(body, {
            x: vx * scale,
            y: vy * scale,
        });

        // Auto-remove after lifespan
        const timer = setTimeout(() => this.removeProjectile(body), PROJECTILE_LIFESPAN_MS);
        this.projectileTimers.set(body.id, timer);
        this.projectileBodies.add(body);

        console.log(`Projectile fired by ${side}: angle=${(angle * 180 / Math.PI).toFixed(1)}deg power=${power.toFixed(1)}`);

        // Tell state machine a projectile was fired, wait for settle
        this.stateMachine.onProjectileFired();
        this.stateMachine.waitForSettle();
    }

    handlePlayerBuildReady(socketId: string): void {
        this.stateMachine.handlePlayerBuildReady(socketId);
        // Auto-ready the bot so build phase ends when the human clicks DONE
        if (this.botAI) {
            const botPlayer = this.getBotPlayer();
            if (botPlayer) {
                this.stateMachine.handlePlayerBuildReady(botPlayer.socketId);
            }
        }
    }

    handleForfeit(): void {
        // Stop the game loop and state machine
        this.stateMachine.destroy();
    }

    destroy() {
        this.botAI?.destroy();
        this.botAI = null;
        this.gameLoop.stop();
        this.stateMachine.destroy();
        for (const timer of this.projectileTimers.values()) {
            clearTimeout(timer);
        }
        this.projectileTimers.clear();
        this.projectileBodies.clear();
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

        // Throttle hazard processing to 15Hz (every 4th tick at 60Hz)
        this.hazardTickCounter++;
        if (this.hazardTickCounter % 4 !== 0) return;

        // Fetch all bodies once and share between hazard helpers
        const bodies = Matter.Composite.allBodies(this.world);

        // Wind — multiply force by 4 to compensate for reduced tick rate
        applyWindForce(bodies, this.windHazards, 4);

        // Lava — reuse the pre-built kingsMap member variable
        checkLavaDamage(bodies, this.world, this.lavaHazards, this.kingsMap, (side, damage) => {
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

    private getBotPlayer(): PlayerState | undefined {
        for (const ps of this.players.values()) {
            if (ps.socketId.startsWith('bot-')) return ps;
        }
        return undefined;
    }

    private getFoundationTopY(kingX: number): number {
        // Replicate the foundation top calculation from spawnKing
        const foundationWidth = 360;
        const halfWidth = foundationWidth / 2;
        const scanStart = Math.floor(kingX - halfWidth);
        const scanEnd = Math.ceil(kingX + halfWidth);

        let highestY = Infinity;
        for (const pt of this.terrain.points) {
            if (pt.x >= scanStart && pt.x <= scanEnd) {
                if (pt.y < highestY) highestY = pt.y;
            }
        }
        if (highestY === Infinity) highestY = this.interpolateTerrainY(kingX);

        const foundationVisibleHeight = 20;
        return highestY - foundationVisibleHeight;
    }

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
        (body as GameBody).side = side;

        Matter.World.add(this.world, body);

        // --- Create Robust Concrete Foundation ---
        // Scan terrain under the King's area to find the highest point (min Y)
        // This ensures the foundation sits on top of the highest terrain peak
        // and extends downwards, so nothing is underground or floating.

        const foundationWidth = 360; // 4 beams wide
        const halfWidth = foundationWidth / 2;
        const scanStart = Math.floor(spawnX - halfWidth);
        const scanEnd = Math.ceil(spawnX + halfWidth);

        // Find highest terrain point (minimum Y value) in the foundation footprint
        let highestY = Infinity; // Lower Y is higher up
        const pts = this.terrain.points;

        // Optimized scan: find points within range or interpolate
        // Since points are sorted by X, we can find range efficiently or just iterate relevant ones
        // Points resolution is 20px, so just iterating all is fast enough for initialization
        for (const pt of pts) {
            if (pt.x >= scanStart && pt.x <= scanEnd) {
                if (pt.y < highestY) highestY = pt.y;
            }
        }

        // If no points found (edge case), use spawnY
        if (highestY === Infinity) highestY = spawnY;

        // Foundation Geometry
        // Top protrudes above highest terrain so it's visible as a platform
        // Bottom extends underground for anchoring
        const foundationVisibleHeight = 20; // How much protrudes above terrain
        const bottomY = CANVAS_HEIGHT + 200;
        const foundationTop = highestY - foundationVisibleHeight;
        const foundationDisplayHeight = bottomY - foundationTop;
        const foundationCenterY = (foundationTop + bottomY) / 2;

        const foundation = Matter.Bodies.rectangle(spawnX, foundationCenterY, foundationWidth, foundationDisplayHeight, {
            isStatic: true,
            label: 'foundation',
            friction: 2.0, // High friction
            render: { fillStyle: '#7D7D7D' } // Stone color
        });

        // Tag it so it doesn't get destroyed easily (high HP)
        this.stampBlockProps(foundation, 'stone', foundationWidth, foundationDisplayHeight);
        (foundation as GameBody).blockHp = 10000; // Indestructible-ish
        (foundation as GameBody).blockMaxHp = 10000;

        Matter.World.add(this.world, foundation);

        // Adjust King Position
        // King should sit exactly on top of the foundation
        // Foundation Top is at `foundationTop`
        // King Y = foundationTop - kingRadius - epsilon
        const correctedKingY = foundationTop - kingRadius - 1;

        Matter.Body.setPosition(body, { x: spawnX, y: correctedKingY });

        // Update King State to match new position
        // ----------------------------------

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
        (body as GameBody).originalWidth = w;
        (body as GameBody).originalHeight = h;
        const hp = MATERIAL_BLOCK_HP[material] ?? null;
        (body as GameBody).blockHp = hp;
        (body as GameBody).blockMaxHp = hp;
    }

    private setupCollisionHandlers() {
        Matter.Events.on(this.engine, 'collisionStart', (event) => {
            for (const pair of event.pairs) {
                const { bodyA, bodyB } = pair;

                // --- King damage from any collision (check BOTH kings) ---
                for (const ps of this.players.values()) {
                    let kingHit = false;
                    let kingBody: Matter.Body | null = null;
                    let otherBody: Matter.Body | null = null;

                    if (bodyA.id === ps.kingState.bodyId) { kingBody = bodyA; otherBody = bodyB; kingHit = true; }
                    else if (bodyB.id === ps.kingState.bodyId) { kingBody = bodyB; otherBody = bodyA; kingHit = true; }

                    if (kingHit && kingBody && otherBody && ps.kingState.hp > 0) {
                        const relativeVelocityX = kingBody.velocity.x - otherBody.velocity.x;
                        const relativeVelocityY = kingBody.velocity.y - otherBody.velocity.y;
                        const relativeSpeed = Math.hypot(relativeVelocityX, relativeVelocityY);
                        const reducedMass = otherBody.isStatic
                            ? kingBody.mass
                            : (kingBody.mass * otherBody.mass) / (kingBody.mass + otherBody.mass);
                        const impactForce = relativeSpeed * reducedMass;
                        if (impactForce >= IMPACT_THRESHOLD && Number.isFinite(impactForce)) {
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
                    const blockHp = (block as GameBody).blockHp;
                    if (blockHp != null && block.label !== 'Terrain' && block.label !== 'king') {
                        const impactForce = projectile.speed * projectile.mass;
                        if (impactForce >= PROJECTILE_MIN_IMPACT) {
                            const blockDamage = impactForce * PROJECTILE_BLOCK_DAMAGE_MULT;
                            (block as GameBody).blockHp = Math.max(0, blockHp - blockDamage);

                            if ((block as GameBody).blockHp <= 0) {
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
        if (!pts || pts.length === 0) return 500;
        if (x <= pts[0].x) return pts[0].y;
        if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;

        // Binary search for the segment containing x
        let lo = 0, hi = pts.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (pts[mid].x <= x) lo = mid;
            else hi = mid;
        }

        const p1 = pts[lo];
        const p2 = pts[hi];
        const t = (x - p1.x) / (p2.x - p1.x);
        return p1.y + t * (p2.y - p1.y);
    }

    private checkProjectileBounds() {
        const tickMaxSpeed = PHYSICS_MAX_SPEED;
        for (const body of this.projectileBodies) {
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
        // Use the projectile Set for O(1) membership check
        if (this.projectileBodies.has(body)) {
            Matter.Composite.remove(this.world, body);
            this.projectileBodies.delete(body);
        }

        const timer = this.projectileTimers.get(body.id);
        if (timer) {
            clearTimeout(timer);
            this.projectileTimers.delete(body.id);
        }

        this.io.to(this.roomId).emit('projectile_removed', { bodyId: body.id });
    }
}
