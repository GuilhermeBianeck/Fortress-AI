import type { Side } from '../types';
import { BOT_BUILD_DELAY_MS } from '../config/constants';
import { BOT_SKILL, type BotDifficulty } from '../shared/difficulty';
import { PausableTimers, type TimerId } from './PausableTimers';
import { findBotShot, type BallisticsScene, type BotShotPlan } from './botBallistics';
import type Matter from 'matter-js';

interface BotFortressBlock {
    shape: 'rectangle';
    material: string;
    offsetX: number; // relative to king X
    offsetY: number; // relative to foundation top Y (negative = above)
    width: number;
    height: number;
}

// Simple castle blueprint: walls, pillars, and a roof around the king
const FORTRESS_BLUEPRINT: BotFortressBlock[] = [
    // Left wall
    { shape: 'rectangle', material: 'stone', offsetX: -60, offsetY: -50, width: 15, height: 100 },
    // Right wall
    { shape: 'rectangle', material: 'stone', offsetX: 60, offsetY: -50, width: 15, height: 100 },
    // Left inner pillar
    { shape: 'rectangle', material: 'wood', offsetX: -36, offsetY: -45, width: 12, height: 90 },
    // Right inner pillar
    { shape: 'rectangle', material: 'wood', offsetX: 36, offsetY: -45, width: 12, height: 90 },
    // Roof beam (main)
    { shape: 'rectangle', material: 'stone', offsetX: 0, offsetY: -106, width: 140, height: 12 },
    // Roof beam (inner)
    { shape: 'rectangle', material: 'wood', offsetX: 0, offsetY: -95, width: 80, height: 10 },
    // Left battlement
    { shape: 'rectangle', material: 'stone', offsetX: -55, offsetY: -119, width: 20, height: 15 },
    // Right battlement
    { shape: 'rectangle', material: 'stone', offsetX: 55, offsetY: -119, width: 20, height: 15 },
    // Center battlement
    { shape: 'rectangle', material: 'stone', offsetX: 0, offsetY: -119, width: 20, height: 15 },
    // Front shield block
    { shape: 'rectangle', material: 'steel', offsetX: -75, offsetY: -20, width: 10, height: 40 },
];

export interface BotAIDeps {
    getKingPosition: () => { x: number; y: number };
    getFoundationTopY: () => number;
    getBallisticsScene: () => BallisticsScene;
    canBuild: () => boolean;
    canFire: () => boolean;
    spawnBlock: (shape: 'rectangle', material: string, x: number, y: number, width: number, height: number) => void;
    fireProjectile: (side: Side, angle: number, power: number) => number | undefined;
    random?: () => number;
}

export interface BotShotObservation {
    projectileId: number;
    closest: Matter.Vector;
    hitLabel?: string;
    hitBodyId?: number;
}

export class BotAI {
    private side: Side;
    private deps: BotAIDeps;
    private fireTimer?: TimerId;
    private buildTimer?: TimerId;
    private destroyed = false;
    private aimOffsetX = 0;
    private observations = 0;
    private pendingShot?: { id: number; plan: BotShotPlan; targetBodyId: number };
    private lastTarget?: Matter.Vector;
    private lastWind = '';
    private random: () => number;

    constructor(side: Side, deps: BotAIDeps, private difficulty: BotDifficulty = 'normal', private timers = new PausableTimers()) {
        this.side = side;
        this.deps = deps;
        this.random = deps.random ?? Math.random;
        this.resetRound();
    }

    resetRound(): void {
        const skill = BOT_SKILL[this.difficulty];
        this.aimOffsetX = (this.random() < 0.5 ? -1 : 1) * (skill.initialOffset + this.random() * skill.offsetRange);
        this.observations = 0;
        this.pendingShot = undefined;
        this.lastTarget = undefined;
        this.lastWind = '';
    }

    buildFortress(): void {
        if (this.destroyed) return;
        this.timers.clear(this.buildTimer);
        this.timers.clear(this.fireTimer);
        this.resetRound();
        this.buildTimer = this.timers.timeout(() => {
            this.buildTimer = undefined;
            if (this.destroyed || !this.deps.canBuild()) return;
            const kingPos = this.deps.getKingPosition();
            const foundationTopY = this.deps.getFoundationTopY();

            for (const block of FORTRESS_BLUEPRINT) {
                const x = kingPos.x + block.offsetX * (this.side === 'right' ? 1 : -1);
                const y = foundationTopY + block.offsetY;
                this.deps.spawnBlock('rectangle', block.material, x, y, block.width, block.height);
            }

            console.log(`BotAI: Built fortress (${FORTRESS_BLUEPRINT.length} blocks) around king at (${kingPos.x.toFixed(0)}, ${kingPos.y.toFixed(0)})`);
        }, BOT_BUILD_DELAY_MS);
    }

    takeTurn(): void {
        if (this.destroyed || !this.deps.canFire()) return;
        this.timers.clear(this.fireTimer);
        this.fireTimer = this.timers.timeout(() => this.fireTurn(), BOT_SKILL[this.difficulty].thinkMs);
    }

    fireTurn(): void {
            this.fireTimer = undefined;
            if (this.destroyed || !this.deps.canFire()) return;
            const scene = this.deps.getBallisticsScene();
            const wind = JSON.stringify(scene.wind);
            if ((this.lastTarget && Math.hypot(scene.target.x - this.lastTarget.x, scene.target.y - this.lastTarget.y) > 100) ||
                (this.lastWind && wind !== this.lastWind)) {
                this.aimOffsetX *= 0.5;
            }
            this.lastTarget = { ...scene.target };
            this.lastWind = wind;
            // Training uncertainty decreases only after observed shots, never merely with time.
            const skill = BOT_SKILL[this.difficulty];
            const uncertainty = Math.max(skill.minimumUncertainty, skill.uncertainty - this.observations * skill.uncertaintyStep);
            const plan = findBotShot(scene, this.aimOffsetX + (this.random() * 2 - 1) * uncertainty);
            if (this.destroyed || !this.deps.canFire()) return;
            const id = this.deps.fireProjectile(this.side, plan.angle, plan.power);
            if (id !== undefined) this.pendingShot = { id, plan, targetBodyId: scene.targetBodyId };
    }

    observeShot(observation: BotShotObservation): void {
        const pending = this.pendingShot;
        if (this.destroyed || !pending || observation.projectileId !== pending.id) return;
        this.pendingShot = undefined;
        if (!Number.isFinite(observation.closest.x) || !Number.isFinite(observation.closest.y)) return;
        this.observations++;
        const skill = BOT_SKILL[this.difficulty];
        const blocked = observation.hitLabel && !['Terrain', 'Boundary', 'king'].includes(observation.hitLabel);
        if (blocked || observation.hitBodyId === pending.targetBodyId) {
            this.aimOffsetX *= skill.hitDecay;
        } else {
            const miss = observation.closest.x - pending.plan.target.x;
            const correction = Math.max(-70, Math.min(70, miss * skill.correction));
            const limit = this.difficulty === 'easy' ? 280 : 140;
            this.aimOffsetX = Math.max(-limit, Math.min(limit, (this.aimOffsetX - correction) * skill.decay));
        }
    }

    destroy(): void {
        this.destroyed = true;
        this.timers.clear(this.fireTimer);
        this.timers.clear(this.buildTimer);
        this.pendingShot = undefined;
    }
}
