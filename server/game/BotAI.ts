import type { Side } from '../types';
import { BOT_FIRE_DELAY_MS, BOT_BUILD_DELAY_MS } from '../config/constants';

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
    { shape: 'rectangle', material: 'stone', offsetX: -60, offsetY: -40, width: 15, height: 80 },
    // Right wall
    { shape: 'rectangle', material: 'stone', offsetX: 60, offsetY: -40, width: 15, height: 80 },
    // Left inner pillar
    { shape: 'rectangle', material: 'wood', offsetX: -30, offsetY: -35, width: 12, height: 70 },
    // Right inner pillar
    { shape: 'rectangle', material: 'wood', offsetX: 30, offsetY: -35, width: 12, height: 70 },
    // Roof beam (main)
    { shape: 'rectangle', material: 'stone', offsetX: 0, offsetY: -82, width: 140, height: 12 },
    // Roof beam (inner)
    { shape: 'rectangle', material: 'wood', offsetX: 0, offsetY: -70, width: 80, height: 10 },
    // Left battlement
    { shape: 'rectangle', material: 'stone', offsetX: -55, offsetY: -95, width: 20, height: 15 },
    // Right battlement
    { shape: 'rectangle', material: 'stone', offsetX: 55, offsetY: -95, width: 20, height: 15 },
    // Center battlement
    { shape: 'rectangle', material: 'stone', offsetX: 0, offsetY: -95, width: 20, height: 15 },
    // Front shield block
    { shape: 'rectangle', material: 'steel', offsetX: -75, offsetY: -20, width: 10, height: 40 },
];

export interface BotAIDeps {
    getKingPosition: () => { x: number; y: number };
    getFoundationTopY: () => number;
    getOpponentKingPosition: () => { x: number; y: number };
    spawnBlock: (shape: 'rectangle', material: string, x: number, y: number, width: number, height: number) => void;
    fireProjectile: (side: Side, angle: number, power: number) => void;
}

export class BotAI {
    private side: Side;
    private deps: BotAIDeps;
    private timers: ReturnType<typeof setTimeout>[] = [];

    constructor(side: Side, deps: BotAIDeps) {
        this.side = side;
        this.deps = deps;
    }

    buildFortress(): void {
        const timer = setTimeout(() => {
            const kingPos = this.deps.getKingPosition();
            const foundationTopY = this.deps.getFoundationTopY();

            for (const block of FORTRESS_BLUEPRINT) {
                const x = kingPos.x + block.offsetX;
                const y = foundationTopY + block.offsetY;
                this.deps.spawnBlock('rectangle', block.material, x, y, block.width, block.height);
            }

            console.log(`BotAI: Built fortress (${FORTRESS_BLUEPRINT.length} blocks) around king at (${kingPos.x.toFixed(0)}, ${kingPos.y.toFixed(0)})`);
        }, BOT_BUILD_DELAY_MS);
        this.timers.push(timer);
    }

    takeTurn(): void {
        const timer = setTimeout(() => {
            const opponentKing = this.deps.getOpponentKingPosition();

            // Add random offset for imperfect aim
            const targetX = opponentKing.x + (Math.random() * 120 - 60);
            const targetY = opponentKing.y + (Math.random() * 40 - 20);

            const myKing = this.deps.getKingPosition();

            // Calculate angle and power to hit the target
            const dx = targetX - myKing.x;
            const dy = targetY - myKing.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Approximate angle and power using projectile physics
            // The bot fires from the cannon, but we use king position as reference
            // Power range: 15-40, angle range: 30-70 degrees
            const normalizedDist = Math.min(dist / 2400, 1);
            const power = 15 + normalizedDist * 25;

            // Angle: higher for closer targets, lower for farther
            const baseAngle = 35 + (1 - normalizedDist) * 30; // 35-65 degrees
            const angleRad = (baseAngle * Math.PI) / 180;

            this.deps.fireProjectile(this.side, angleRad, power);
            console.log(`BotAI: Fired projectile - angle=${baseAngle.toFixed(1)}deg power=${power.toFixed(1)}`);
        }, BOT_FIRE_DELAY_MS);
        this.timers.push(timer);
    }

    destroy(): void {
        for (const timer of this.timers) {
            clearTimeout(timer);
        }
        this.timers = [];
    }
}
