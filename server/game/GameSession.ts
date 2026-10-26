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
import { closestOnSegment } from './botBallistics';
import { closingSpeed, kingImpactDamage, projectileBlockDamage } from './impactDamage';
import {
    MATERIAL_PROPS, MATERIAL_BLOCK_HP,
    KING_MAX_HP, KING_WIDTH, KING_HEIGHT, KING_MASS,
    KING_FOUNDATION_WIDTH, KING_FOUNDATION_HEIGHT, KING_FOUNDATION_RISE,
    PROJECTILE_RADIUS, PROJECTILE_DENSITY, PROJECTILE_RESTITUTION,
    PROJECTILE_FRICTION, PROJECTILE_LIFESPAN_MS,
    WORLD_WIDTH, CANVAS_HEIGHT,
    LEFT_SIDE, RIGHT_SIDE,
    FALLING_ROCK_INTERVAL_MS, FALLING_ROCK_RADIUS,
    COL_BLOCK, SHAPE_DIMS,
    PHYSICS_MAX_SPEED, PHYSICS_POWER_MULTIPLIER, PHYSICS_AIR_FRICTION,
} from '../config/constants';
import { generateHazards, applyWindForce, checkLavaDamage } from '../physics/hazards';

// Rate limiting for server-side AI key usage (shared across all sessions)
const AI_RATE_LIMIT_MAX = 3;
const AI_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const aiRateLimits: Map<string, number[]> = new Map(); // uuid → timestamps

function isAiRateLimited(uuid: string): boolean {
    const now = Date.now();
    const timestamps = aiRateLimits.get(uuid) || [];
    const recent = timestamps.filter(t => now - t < AI_RATE_LIMIT_WINDOW_MS);
    aiRateLimits.set(uuid, recent);
    return recent.length >= AI_RATE_LIMIT_MAX;
}

function recordAiUsage(uuid: string): void {
    const timestamps = aiRateLimits.get(uuid) || [];
    timestamps.push(Date.now());
    aiRateLimits.set(uuid, timestamps);
}

/** Matter.js Body extended with custom game properties */
interface GameBody extends Matter.Body {
    blockHp?: number | null;
    blockMaxHp?: number | null;
    originalWidth?: number;
    originalHeight?: number;
    isBullet?: boolean;
    side?: Side;
}

import { PausableTimers, type TimerId } from './PausableTimers';
import type { BotDifficulty } from '../shared/difficulty';
import { kingCannonX } from '../shared/battleLayout';
import { SHOT_FLIGHT_RATE } from '../shared/shotPacing';

export class GameSession {
    readonly id: string;
    private engine: Matter.Engine;
    private world: Matter.World;
    private terrain: TerrainResult & { seed: number };
    private players: Map<string, PlayerState> = new Map(); // socketId → PlayerState
    private gameLoop: GameLoop;
    private io: Server;
    private roomId: string;
    private projectileTimers: Map<number, TimerId> = new Map();
    private timers = new PausableTimers();
    private paused = false;
    private buildGeneration = 0;
    private buildHeartbeats = new Set<ReturnType<typeof setInterval>>();
    private interruptedBuildSides = new Set<Side>();
    private projectileBodies: Set<Matter.Body> = new Set();
    private projectileBornAt = new Map<number, number>();
    private projectileHits = new Map<number, Set<number>>();
    private botShotTracks = new Map<number, {
        target: Matter.Vector; previous: Matter.Vector; closest: Matter.Vector; distance: number;
    }>();
    private destroyed = false;
    private kingsMap: Map<Side, KingState> = new Map();
    private foundations = new Map<Side, Matter.Body>();
    private buildSupports: Matter.Constraint[] = [];
    private stateMachine: MatchStateMachine;
    private onPhaseChangeCallback?: (phase: MatchPhase) => void;
    private onRoundEndCallback?: (winner: Side, reason: string) => 'continue' | 'match_over';
    private hazards: HazardData[] = [];
    private windHazards: HazardData[] = [];
    private lavaHazards: HazardData[] = [];
    private hazardTimers: TimerId[] = [];
    private scoreManager: ScoreManager = new ScoreManager();
    private botAI: BotAI | null = null;
    private hazardTickCounter = 0;
    private leftPlayer: PlayerState | null = null;
    private rightPlayer: PlayerState | null = null;
    private buildInProgress: Set<string> = new Set(); // socketIds with active builds

    constructor(io: Server, roomId: string, playerInfos: PlayerInfo[], seed?: number, onPhaseChange?: (phase: MatchPhase) => void, onRoundEnd?: (winner: Side, reason: string) => 'continue' | 'match_over', difficulty: BotDifficulty = 'normal') {
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
            const king = this.spawnKing(info.side, sideBounds);
            const cannonX = kingCannonX(info.side, king.body.position.x, WORLD_WIDTH);

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
        this.gameLoop.setAfterTick(() => this.updateKings());
        this.gameLoop.start();

        // Create state machine
        this.stateMachine = new MatchStateMachine(io, roomId, {
            onPhaseChange: (phase) => {
                this.onPhaseChangeCallback?.(phase);
                if (phase === 'combat') {
                    for (const support of this.buildSupports) Matter.Composite.remove(this.world, support);
                    this.buildSupports = [];
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
                this.gameLoop.publishFullState();
                // Freeze the resolved scene and release bot/hazard/physics timers during results.
                this.destroy();
                return this.onRoundEndCallback?.(winner, reason) ?? 'match_over';
            },
            getKingState: (side: Side) => this.getKingStateBySide(side),
            getWorld: () => this.world,
        }, this.timers);

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
                    return this.foundations.get(ps.side)?.bounds.min.y ?? this.interpolateTerrainY(ps.kingBody.position.x);
                },
                getBallisticsScene: () => {
                    const opponent = this.getPlayerBySide(opponentSide)!;
                    return {
                        side: botSide,
                        cannon: { x: botPlayer.cannonX, y: this.interpolateTerrainY(botPlayer.cannonX) - 20 },
                        target: { ...opponent.kingBody.position }, targetBodyId: opponent.kingBody.id,
                        gravity: { ...this.engine.gravity }, wind: this.windHazards,
                        windTick: this.hazardTickCounter % 4,
                        bodies: Matter.Composite.allBodies(this.world),
                    };
                },
                canBuild: () => !this.destroyed && this.stateMachine.getPhase() === 'build',
                canFire: () => !this.destroyed && this.stateMachine.canFire() && this.stateMachine.getCurrentTurn() === botSide,
                spawnBlock: (shape, material, x, y, width, height) => {
                    this.createBody(shape, material, x, y, [width, height]);
                },
                fireProjectile: (side, angle, power) => {
                    return this.fireProjectile(side, angle, power);
                },
            }, difficulty, this.timers);
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

    getFullState() { return this.gameLoop.getFullState(); }
    isPaused() { return this.paused; }
    buildWasInterrupted(side: Side) { return this.interruptedBuildSides.has(side); }
    rebindPlayer(oldId: string, newId: string): void {
        const player = this.players.get(oldId);
        if (!player) return;
        this.players.delete(oldId); player.socketId = newId; this.players.set(newId, player);
        this.stateMachine.rebindPlayer(oldId, newId);
    }
    private invalidateBuilds(): void {
        this.buildGeneration++;
        for (const timer of this.buildHeartbeats) clearInterval(timer);
        this.buildHeartbeats.clear();
        for (const id of this.buildInProgress) {
            const player = this.players.get(id); if (player) this.interruptedBuildSides.add(player.side);
            this.io.to(id).emit('build_error', { message: 'Build cancelled because play was interrupted. Submit again when ready.' });
        }
        this.buildInProgress.clear();
    }
    pause(): void {
        if (this.paused) return;
        this.paused = true; this.invalidateBuilds();
        this.gameLoop.stop(); this.stateMachine.pause(); this.scoreManager.pause();
    }
    resume(): void {
        if (!this.paused) return;
        this.paused = false; this.stateMachine.resume(); this.scoreManager.resume();
        if (!this.destroyed) this.gameLoop.start();
    }

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
        const cannons: Partial<Record<Side, Matter.Vector>> = {};
        for (const player of this.players.values()) cannons[player.side] = {
            x: player.cannonX, y: this.interpolateTerrainY(player.cannonX) - 20,
        };
        return {
            cannons,
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
        if (this.paused || this.destroyed || !data || typeof data !== 'object') return;
        const phase = this.stateMachine.getPhase();
        if (phase !== 'build') return;

        const player = this.players.get(socketId);
        if (!player) return;

        const { x, y, material = 'wood', shape = 'rectangle' } = data;

        // Validate coordinates are finite numbers within world bounds
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (x < player.buildZone.xMin || x > player.buildZone.xMax) return;
        if (y < -200 || y > CANVAS_HEIGHT + 100) return;

        // Use predefined shape dimensions
        const dims = SHAPE_DIMS[shape] || SHAPE_DIMS.rectangle;
        const w = dims[0];
        const h = dims[1];

        console.log(`Spawn: ${shape} ${material} at (${x.toFixed(0)}, ${y.toFixed(0)}) dims=${w}x${h} by ${player.side}`);

        this.createBody('rectangle', material, x, y, [w, h]);
        this.scoreManager.recordResourceUsed(player.side);
    }

    async handleRequestBuild(socket: Socket, data: { apiKey?: string; prompt: string }, playerUuid?: string) {
        if (this.paused || this.destroyed || !data || typeof data !== 'object' || typeof data.prompt !== 'string') return;
        const phase = this.stateMachine.getPhase();
        if (phase !== 'build') {
            socket.emit('build_error', { message: 'Building is only allowed during the build phase.' });
            return;
        }

        const player = this.players.get(socket.id);
        if (!player) return;

        // Prevent duplicate build requests
        if (this.buildInProgress.has(socket.id)) {
            socket.emit('build_error', { message: 'Build already in progress' });
            return;
        }

        const { apiKey: clientKey, prompt } = data;
        if (!prompt) {
            socket.emit('build_error', { message: 'Missing prompt' });
            return;
        }

        // Use client key if provided, otherwise fall back to server key
        const apiKey = clientKey || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            socket.emit('build_error', { message: 'AI unavailable — no API key configured.' });
            return;
        }

        // Rate limit when using server key (not client's own key)
        if (!clientKey && playerUuid) {
            if (isAiRateLimited(playerUuid)) {
                socket.emit('build_error', {
                    message: 'Free AI limit reached (3/hour). Set your own Gemini API key for unlimited builds.',
                });
                return;
            }
            recordAiUsage(playerUuid);
        }

        this.buildInProgress.add(socket.id);
        this.interruptedBuildSides.delete(player.side);
        const generation = this.buildGeneration;

        // Start heartbeat so the client knows the build is still running
        const buildStart = Date.now();
        const heartbeat = setInterval(() => {
            const elapsed = Math.round((Date.now() - buildStart) / 1000);
            socket.emit('build_status', { status: 'generating', message: `Generating fortress... (${elapsed}s)` });
        }, 3000);
        this.buildHeartbeats.add(heartbeat);

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
            if (generation !== this.buildGeneration || this.destroyed || this.paused || this.stateMachine.getPhase() !== 'build') return;

            if (!plan.bodies || plan.bodies.length === 0) {
                socket.emit('build_error', { message: 'AI generated no blocks. Try a different prompt.' });
                return;
            }

            clearInterval(heartbeat);

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
            clearInterval(heartbeat);
            if (generation !== this.buildGeneration || this.destroyed) return;
            // Provider error messages can contain credential-bearing URLs.
            console.error('Build request failed:', err instanceof Error ? err.name : 'Unknown error');
            socket.emit('build_error', { message: 'AI generation failed. Please try again.' });
        } finally {
            clearInterval(heartbeat); this.buildHeartbeats.delete(heartbeat);
            if (generation === this.buildGeneration) this.buildInProgress.delete(socket.id);
        }
    }

    handleFireProjectile(socketId: string, data: { angle?: unknown; power?: unknown }) {
        if (!data || typeof data !== 'object') return;
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

    fireProjectile(side: Side, rawAngle: number, rawPower: number): number | undefined {
        if (this.destroyed || !this.stateMachine.canFire() || this.stateMachine.getCurrentTurn() !== side) return;
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
        (body as GameBody).side = side;

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
        const timer = this.timers.timeout(() => this.removeProjectile(body), Math.ceil(PROJECTILE_LIFESPAN_MS / SHOT_FLIGHT_RATE));
        this.projectileTimers.set(body.id, timer);
        this.projectileBodies.add(body);
        this.projectileBornAt.set(body.id, this.engine.timing.timestamp);
        this.projectileHits.set(body.id, new Set());
        if (this.botAI && this.getBotPlayer()?.side === side) {
            const opponent = this.getPlayerBySide(side === 'left' ? 'right' : 'left');
            if (opponent) {
                const target = { ...opponent.kingBody.position };
                this.botShotTracks.set(body.id, {
                    target, previous: { ...body.position }, closest: { ...body.position },
                    distance: Matter.Vector.magnitude(Matter.Vector.sub(body.position, target)),
                });
            }
        }

        console.log(`Projectile fired by ${side}: angle=${(angle * 180 / Math.PI).toFixed(1)}deg power=${power.toFixed(1)}`);

        // Tell state machine a projectile was fired, wait for settle
        this.stateMachine.onProjectileFired();
        this.stateMachine.waitForSettle();
        return body.id;
    }

    handlePlayerBuildReady(socketId: string): void {
        if (this.paused || this.destroyed) return;
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
        // Keep the final world readable for results, but release every ticking resource.
        this.destroy();
    }

    destroy() {
        this.destroyed = true;
        this.invalidateBuilds();
        this.botAI?.destroy();
        this.botAI = null;
        this.gameLoop.stop();
        this.stateMachine.destroy();
        for (const timer of this.projectileTimers.values()) {
            this.timers.clear(timer);
        }
        this.projectileTimers.clear();
        this.projectileBodies.clear();
        this.projectileBornAt.clear();
        this.projectileHits.clear();
        this.botShotTracks.clear();
        for (const timer of this.hazardTimers) {
            this.timers.clear(timer);
        }
        this.hazardTimers = [];
        this.timers.dispose();
    }

    startFallingRocks(): void {
        // Prevent duplicate falling rock intervals
        if (this.hazardTimers.length > 0) return;

        const rockHazards = this.hazards.filter(h => h.type === 'falling_rocks');
        if (rockHazards.length === 0) return;

        const interval = this.timers.interval(() => {
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
                    timestamp: Date.now(), position: { ...ps.kingBody.position },
                });
            }
        });
    }

    // --- Private ---

    private updateKings(): void {
        for (const ps of this.players.values()) {
            const body = ps.kingBody;
            ps.kingState.position = { ...body.position };
            if (ps.kingState.hp <= 0) continue;
            // Kings can be knocked back and fall, but are characters, not rolling balls.
            if (body.angle !== 0) Matter.Body.setAngle(body, 0);
            if (body.angularVelocity !== 0) Matter.Body.setAngularVelocity(body, 0);
            const vx = Math.max(-8, Math.min(8, body.velocity.x));
            const vy = Math.max(-10, Math.min(20, body.velocity.y));
            if (vx !== body.velocity.x || vy !== body.velocity.y) Matter.Body.setVelocity(body, { x: vx, y: vy });
            if (this.stateMachine.getPhase() === 'combat' && (body.position.y > CANVAS_HEIGHT + KING_HEIGHT || body.position.x < -KING_WIDTH || body.position.x > WORLD_WIDTH + KING_WIDTH)) {
                const damage = ps.kingState.hp;
                ps.kingState.hp = 0;
                this.io.to(this.roomId).emit('king_damage', { side: ps.side, hp: 0, maxHp: ps.kingState.maxHp, damage, source: 'fall', timestamp: Date.now(), position: { ...body.position } });
                this.io.to(this.roomId).emit('king_dead', { side: ps.side });
            }
        }
        this.stateMachine.checkKingDefeat();
    }

    private getBotPlayer(): PlayerState | undefined {
        for (const ps of this.players.values()) {
            if (ps.socketId.startsWith('bot-')) return ps;
        }
        return undefined;
    }

    private getKingStateBySide(side: Side): KingState {
        for (const ps of this.players.values()) {
            if (ps.side === side) return ps.kingState;
        }
        // Fallback (shouldn't happen)
        return { bodyId: -1, hp: 0, maxHp: 0, position: { x: 0, y: 0 } };
    }

    private spawnKing(side: Side, sideBounds: { min: number; max: number }): { body: Matter.Body; state: KingState } {
        const gap = 2;

        // Find a build zone within this side
        const sideZones = this.terrain.buildZones.filter(
            z => z.x >= sideBounds.min && z.x + z.width <= sideBounds.max
        );

        let spawnX: number;
        const center = (sideBounds.min + sideBounds.max) / 2;
        const suitableZones = sideZones.filter(zone => zone.width >= KING_FOUNDATION_WIDTH + 20 && zone.x > sideBounds.min + 100 && zone.x + zone.width < sideBounds.max - 100)
            .sort((a, b) => Math.abs(a.x + a.width / 2 - center) - Math.abs(b.x + b.width / 2 - center));
        if (suitableZones.length > 0) {
            const zone = suitableZones[0];
            spawnX = zone.x + zone.width / 2;
        } else {
            // Fallback: center of side
            spawnX = (sideBounds.min + sideBounds.max) / 2;
        }

        const spawnY = this.interpolateTerrainY(spawnX) - KING_HEIGHT / 2 - gap;

        const body = Matter.Bodies.rectangle(spawnX, spawnY, KING_WIDTH, KING_HEIGHT, {
            chamfer: { radius: 5 },
            restitution: 0.02,
            friction: 1,
            frictionStatic: 4,
            frictionAir: 0.025,
            label: 'king',
        });
        Matter.Body.setMass(body, KING_MASS);
        Matter.Body.setInertia(body, Infinity);
        (body as GameBody).originalWidth = KING_WIDTH;
        (body as GameBody).originalHeight = KING_HEIGHT;

        // Tag with side for collision identification
        (body as GameBody).side = side;

        Matter.World.add(this.world, body);

        // --- Compact stone platform under the king ---
        // A small, clean plinth: wide enough to give the king a stable seat,
        // narrow enough not to dominate the view. The body is static so
        // Matter.js never moves it — no need for a huge underground anchor.
        const foundationWidth = KING_FOUNDATION_WIDTH;
        const halfWidth = foundationWidth / 2;
        const scanStart = Math.floor(spawnX - halfWidth);
        const scanEnd = Math.ceil(spawnX + halfWidth);

        // Find the highest terrain point under the platform footprint so
        // the platform rests on the peak rather than floating on an average.
        const edgeHeights = [this.interpolateTerrainY(scanStart), this.interpolateTerrainY(scanEnd)];
        let highestY = Math.min(...edgeHeights), lowestY = Math.max(...edgeHeights);
        for (const pt of this.terrain.points) {
            if (pt.x >= scanStart && pt.x <= scanEnd) {
                highestY = Math.min(highestY, pt.y);
                lowestY = Math.max(lowestY, pt.y);
            }
        }

        // Expose ~34px above terrain so the platform reads as a plinth,
        // with the remainder below terrain so it visually grounds into the hill.
        const foundationVisibleHeight = KING_FOUNDATION_RISE;
        const foundationTop = highestY - foundationVisibleHeight;
        const foundationHeight = Math.max(KING_FOUNDATION_HEIGHT, lowestY + 12 - foundationTop);
        const foundationCenterY = foundationTop + foundationHeight / 2;

        const foundation = Matter.Bodies.rectangle(spawnX, foundationCenterY, foundationWidth, foundationHeight, {
            isStatic: true,
            label: 'foundation',
            friction: 2.0,
            render: { fillStyle: '#7D7D7D' },
        });

        this.stampBlockProps(foundation, 'stone', foundationWidth, foundationHeight);
        (foundation as GameBody).blockHp = 10000;
        (foundation as GameBody).blockMaxHp = 10000;

        Matter.World.add(this.world, foundation);
        this.foundations.set(side, foundation);

        // Place the feet on the platform without an initial interpenetration.
        const correctedKingY = foundationTop - KING_HEIGHT / 2 - 1;

        Matter.Body.setPosition(body, { x: spawnX, y: correctedKingY });
        // Construction is a safe staging phase; release the support when combat begins.
        const support = Matter.Constraint.create({ bodyB: body, pointA: { ...body.position }, length: 0, stiffness: 1, damping: 0.2 });
        this.buildSupports.push(support);
        Matter.Composite.add(this.world, support);

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

        // Building around a king must not place a block through the visible character.
        for (const player of this.players.values()) {
            const king = player.kingBody;
            const feet = king.position.y + KING_HEIGHT / 2;
            if (body.bounds.max.x > king.position.x - 26 && body.bounds.min.x < king.position.x + 26 &&
                body.bounds.max.y > feet - 84 && body.bounds.min.y < feet) {
                Matter.Body.translate(body, { x: 0, y: feet - 88 - body.bounds.max.y });
            }
        }

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
            const processedPairs = new Set<string>();
            for (const pair of event.pairs) {
                const { bodyA, bodyB } = pair;
                const timestamp = Date.now();
                let kingDamage = 0;
                const pairId = [bodyA.id, bodyB.id].sort((a, b) => a - b).join(':');
                if (processedPairs.has(pairId)) continue;
                processedPairs.add(pairId);
                const projectile = bodyA.label === 'projectile' ? bodyA : bodyB.label === 'projectile' ? bodyB : null;
                const hitBody = projectile === bodyA ? bodyB : bodyA;
                if (projectile) {
                    this.observeBotProjectile(projectile, hitBody);
                    const hits = this.projectileHits.get(projectile.id) ?? new Set<number>();
                    this.projectileHits.set(projectile.id, hits);
                    if (hits.has(hitBody.id)) continue;
                    hits.add(hitBody.id);
                }
                const speed = closingSpeed(pair.collision.bodyA, pair.collision.bodyB, pair.collision.normal);

                // --- King damage from any collision (check BOTH kings) ---
                for (const ps of this.players.values()) {
                    let kingHit = false;
                    let kingBody: Matter.Body | null = null;
                    let otherBody: Matter.Body | null = null;

                    if (bodyA.id === ps.kingState.bodyId) { kingBody = bodyA; otherBody = bodyB; kingHit = true; }
                    else if (bodyB.id === ps.kingState.bodyId) { kingBody = bodyB; otherBody = bodyA; kingHit = true; }

                    if (kingHit && kingBody && otherBody && ps.kingState.hp > 0 && this.stateMachine.getPhase() === 'combat') {
                        const damage = Math.min(ps.kingState.hp, kingImpactDamage(kingBody, otherBody, speed));
                        if (damage > 0) {
                            kingDamage = damage;
                            ps.kingState.hp = Math.max(0, ps.kingState.hp - damage);
                            ps.kingState.position = { x: ps.kingBody.position.x, y: ps.kingBody.position.y };

                            // Record damage for scoring (attacker is the opposite side)
                            const attackerSide: Side = (otherBody as GameBody).side ?? (ps.side === 'left' ? 'right' : 'left');
                            if (attackerSide !== ps.side) this.scoreManager.recordDamage(attackerSide, damage);

                            console.log(`${ps.side} King hit by ${otherBody.label} | speed=${speed.toFixed(1)} | damage=${damage.toFixed(1)} | HP=${ps.kingState.hp.toFixed(1)}/${ps.kingState.maxHp}`);

                            this.io.to(this.roomId).emit('king_damage', {
                                side: ps.side,
                                hp: ps.kingState.hp,
                                maxHp: ps.kingState.maxHp,
                                damage,
                                source: otherBody.label,
                                timestamp, position: { ...kingBody.position }, projectileId: projectile?.id, attackerSide,
                            });

                            if (ps.kingState.hp <= 0) {
                                console.log(`${ps.side} King is dead!`);
                                this.io.to(this.roomId).emit('king_dead', { side: ps.side });
                            }
                        }
                    }
                }

                // --- Projectile vs block damage ---
                const block = projectile && hitBody.label !== 'projectile' ? hitBody : null;

                if (projectile && block) {
                    let appliedDamage = kingDamage, destroyed = false;

                    // Block HP damage (skip terrain, king, other projectiles)
                    const blockHp = (block as GameBody).blockHp;
                    if (blockHp != null && blockHp > 0 && block.label !== 'Terrain' && block.label !== 'king') {
                        const blockDamage = projectileBlockDamage(projectile, block, speed);
                        if (blockDamage > 0) {
                            appliedDamage = Math.min(blockHp!, blockDamage);
                            (block as GameBody).blockHp = Math.max(0, blockHp - blockDamage);

                            if (((block as GameBody).blockHp ?? 0) <= 0) {
                                destroyed = true;
                                this.io.to(this.roomId).emit('block_destroyed', {
                                    bodyId: block.id,
                                    position: { x: block.position.x, y: block.position.y },
                                    material: block.label,
                                    velocity: { x: block.velocity.x, y: block.velocity.y },
                                    timestamp,
                                });
                                Matter.Composite.remove(this.world, block);
                            }
                        }
                    }
                    this.io.to(this.roomId).emit('projectile_impact', {
                        side: (projectile as GameBody).side,
                        position: { ...projectile.position }, timestamp, projectileId: projectile.id, targetId: block.id,
                        target: block.label === 'king' ? 'king' : ['Terrain', 'Boundary', 'foundation'].includes(block.label) ? 'terrain' : 'block',
                        material: block.label, damage: appliedDamage, destroyed,
                    });
                }
            }
        });
    }

    private sampleBotProjectile(body: Matter.Body): void {
        const track = this.botShotTracks.get(body.id);
        if (!track) return;
        const point = closestOnSegment(track.previous, body.position, track.target);
        const distance = Math.hypot(point.x - track.target.x, point.y - track.target.y);
        if (distance < track.distance) {
            track.closest = point;
            track.distance = distance;
        }
        track.previous = { ...body.position };
    }

    private observeBotProjectile(body: Matter.Body, hit?: Matter.Body): void {
        this.sampleBotProjectile(body);
        const track = this.botShotTracks.get(body.id);
        if (!track) return;
        this.botShotTracks.delete(body.id);
        this.botAI?.observeShot({
            projectileId: body.id, closest: track.closest, hitLabel: hit?.label, hitBodyId: hit?.id,
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
            this.sampleBotProjectile(body);
            if (this.engine.timing.timestamp - (this.projectileBornAt.get(body.id) ?? 0) >= PROJECTILE_LIFESPAN_MS ||
                body.position.y > CANVAS_HEIGHT + 50 ||
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
        this.projectileBornAt.delete(body.id);
        this.observeBotProjectile(body);
        this.projectileHits.delete(body.id);
        // Use the projectile Set for O(1) membership check
        if (this.projectileBodies.has(body)) {
            Matter.Composite.remove(this.world, body);
            this.projectileBodies.delete(body);
        }

        const timer = this.projectileTimers.get(body.id);
        if (timer) {
            this.timers.clear(timer);
            this.projectileTimers.delete(body.id);
        }

        this.io.to(this.roomId).emit('projectile_removed', { bodyId: body.id });
    }
}
