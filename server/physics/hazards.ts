import Matter from 'matter-js';
import type { HazardData, HazardType, KingState, Side } from '../types';
import type { TerrainResult } from './terrain';
import {
    WIND_STRENGTH,
    LAVA_DAMAGE_PER_TICK,
    WORLD_WIDTH,
    CANVAS_HEIGHT,
} from '../config/constants';

// Seeded RNG helper
function seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

const HAZARD_TYPES: HazardType[] = ['wind_zone', 'lava_pool', 'falling_rocks'];

export function generateHazards(terrain: TerrainResult, seed: number): HazardData[] {
    const rng = seededRandom(seed + 12345);
    const hazards: HazardData[] = [];

    // Pick 1-2 hazard types
    const count = rng() < 0.5 ? 1 : 2;
    const shuffled = [...HAZARD_TYPES].sort(() => rng() - 0.5);
    const chosen = shuffled.slice(0, count);

    // Place hazards in the middle zone (~400-1200px)
    const midStart = 400;
    const midEnd = 1200;
    const midWidth = midEnd - midStart;

    for (const type of chosen) {
        const id = `hazard_${type}_${Math.floor(rng() * 10000)}`;

        if (type === 'wind_zone') {
            // Wind covers the entire world width, full height
            hazards.push({
                type: 'wind_zone',
                id,
                position: { x: 0, y: 0 },
                width: WORLD_WIDTH,
                height: CANVAS_HEIGHT,
                windDirection: rng() < 0.5 ? -1 : 1,
                windStrength: WIND_STRENGTH,
            });
        } else if (type === 'lava_pool') {
            const w = 80 + rng() * 120;
            const x = midStart + rng() * (midWidth - w);
            const terrainY = interpolateTerrainY(terrain.points, x + w / 2);
            hazards.push({
                type: 'lava_pool',
                id,
                position: { x, y: terrainY - 10 },
                width: w,
                height: 10,
                damage: LAVA_DAMAGE_PER_TICK,
            });
        } else if (type === 'falling_rocks') {
            const w = 150 + rng() * 100;
            const x = midStart + rng() * (midWidth - w);
            hazards.push({
                type: 'falling_rocks',
                id,
                position: { x, y: 0 },
                width: w,
                height: CANVAS_HEIGHT,
            });
        }
    }

    return hazards;
}

export function applyWindForce(world: Matter.World, hazards: HazardData[]): void {
    const windHazards = hazards.filter(h => h.type === 'wind_zone');
    if (windHazards.length === 0) return;

    const bodies = Matter.Composite.allBodies(world);
    for (const body of bodies) {
        if (body.isStatic || body.label === 'Terrain') continue;

        for (const wind of windHazards) {
            const bx = body.position.x;
            const by = body.position.y;
            const { x, y } = wind.position;
            if (bx >= x && bx <= x + wind.width && by >= y && by <= y + wind.height) {
                const dir = wind.windDirection ?? 1;
                const str = wind.windStrength ?? WIND_STRENGTH;
                Matter.Body.applyForce(body, body.position, {
                    x: dir * str * body.mass,
                    y: 0,
                });
            }
        }
    }
}

export function checkLavaDamage(
    world: Matter.World,
    hazards: HazardData[],
    kings: Map<Side, KingState>,
    emitKingDamage: (side: Side, damage: number) => void,
): void {
    const lavaHazards = hazards.filter(h => h.type === 'lava_pool');
    if (lavaHazards.length === 0) return;

    const bodies = Matter.Composite.allBodies(world);
    for (const body of bodies) {
        if (body.isStatic || body.label === 'Terrain') continue;

        for (const lava of lavaHazards) {
            const bx = body.position.x;
            const by = body.position.y;
            const { x, y } = lava.position;
            if (bx >= x && bx <= x + lava.width && by >= y && by <= y + lava.height) {
                const dmg = lava.damage ?? LAVA_DAMAGE_PER_TICK;

                // Damage blocks
                if ((body as any).blockHp != null) {
                    (body as any).blockHp = Math.max(0, (body as any).blockHp - dmg * 0.1);
                    if ((body as any).blockHp <= 0) {
                        Matter.Composite.remove(world, body);
                    }
                }

                // Damage kings
                if (body.label === 'king') {
                    const kingSide = (body as any).side as Side;
                    const kingState = kings.get(kingSide);
                    if (kingState && kingState.hp > 0) {
                        kingState.hp = Math.max(0, kingState.hp - dmg * 0.05);
                        emitKingDamage(kingSide, dmg * 0.05);
                    }
                }
            }
        }
    }
}

function interpolateTerrainY(points: { x: number; y: number }[], x: number): number {
    for (let i = 0; i < points.length - 1; i++) {
        if (points[i].x <= x && points[i + 1].x >= x) {
            const t = (x - points[i].x) / (points[i + 1].x - points[i].x);
            return points[i].y + t * (points[i + 1].y - points[i].y);
        }
    }
    return points[points.length - 1]?.y ?? 500;
}
