import Matter from 'matter-js';
import type { HazardData, HazardType, KingState, Side } from '../types';
import type { TerrainResult } from './terrain';
import {
    WIND_STRENGTH,
    LAVA_DAMAGE_PER_TICK,
    WORLD_WIDTH,
    CANVAS_HEIGHT,
} from '../config/constants';

/** Matter.js Body with custom game properties used in hazard checks */
interface HazardBody extends Matter.Body {
    blockHp?: number | null;
    side?: Side;
}

// Seeded RNG helper
function seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

// Wind is rolled every combat turn (see shared/combatTuning), not as a match hazard.
const HAZARD_TYPES: HazardType[] = ['lava_pool', 'falling_rocks'];

export interface NeutralZone { min: number; max: number }

/** Hazards sit centered in the no-man's-land between the cannons so neither side is favored. */
export function generateHazards(
    terrain: TerrainResult, seed: number,
    neutral: NeutralZone = { min: WORLD_WIDTH / 2 - 400, max: WORLD_WIDTH / 2 + 400 },
): HazardData[] {
    const rng = seededRandom(seed + 12345);
    const hazards: HazardData[] = [];

    // Pick 1-2 hazard types
    const count = rng() < 0.5 ? 1 : 2;
    const shuffled = [...HAZARD_TYPES].sort(() => rng() - 0.5);
    const chosen = shuffled.slice(0, count);

    const center = (neutral.min + neutral.max) / 2;
    const room = Math.max(0, neutral.max - neutral.min);

    for (const type of chosen) {
        const id = `hazard_${type}_${Math.floor(rng() * 10000)}`;

        if (type === 'lava_pool') {
            const w = Math.min(room, 80 + rng() * 120);
            const x = center - w / 2;
            const terrainY = interpolateTerrainY(terrain.points, center);
            hazards.push({
                type: 'lava_pool',
                id,
                position: { x, y: terrainY - 10 },
                width: w,
                height: 10,
                damage: LAVA_DAMAGE_PER_TICK,
            });
        } else if (type === 'falling_rocks') {
            const w = Math.min(room, 150 + rng() * 100);
            hazards.push({
                type: 'falling_rocks',
                id,
                position: { x: center - w / 2, y: 0 },
                width: w,
                height: CANVAS_HEIGHT,
            });
        }
    }

    return hazards;
}

export function applyWindForce(bodies: Matter.Body[], windHazards: HazardData[], forceMultiplier: number = 1): void {
    if (windHazards.length === 0) return;

    for (const body of bodies) {
        if (body.isStatic || body.label === 'Terrain') continue;

        for (const wind of windHazards) {
            const bx = body.position.x;
            const by = body.position.y;
            const { x, y } = wind.position;
            if (bx >= x && bx <= x + wind.width && by >= y && by <= y + wind.height) {
                const dir = wind.windDirection ?? 1;
                const str = wind.windStrength ?? WIND_STRENGTH;

                // Cap wind effect (user request: "should be less")
                // Apply reduced force
                const WIND_INFLUENCE_FACTOR = 0.4;

                Matter.Body.applyForce(body, body.position, {
                    x: dir * str * WIND_INFLUENCE_FACTOR * forceMultiplier,
                    y: 0,
                });
            }
        }
    }
}

export function checkLavaDamage(
    bodies: Matter.Body[],
    world: Matter.World,
    lavaHazards: HazardData[],
    kings: Map<Side, KingState>,
    emitKingDamage: (side: Side, damage: number) => void,
): void {
    if (lavaHazards.length === 0) return;

    for (const body of bodies) {
        if (body.isStatic || body.label === 'Terrain') continue;

        for (const lava of lavaHazards) {
            const bx = body.position.x;
            const by = body.position.y;
            const { x, y } = lava.position;
            if (bx >= x && bx <= x + lava.width && by >= y && by <= y + lava.height) {
                const dmg = lava.damage ?? LAVA_DAMAGE_PER_TICK;

                // Damage blocks
                if ((body as HazardBody).blockHp != null) {
                    (body as HazardBody).blockHp = Math.max(0, ((body as HazardBody).blockHp ?? 0) - dmg * 0.1);
                    if (((body as HazardBody).blockHp ?? 0) <= 0) {
                        Matter.Composite.remove(world, body);
                    }
                }

                // Damage kings
                if (body.label === 'king') {
                    const kingSide = (body as HazardBody).side as Side;
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
    if (points.length === 0) return 500;
    if (x <= points[0].x) return points[0].y;
    if (x >= points[points.length - 1].x) return points[points.length - 1].y;

    // Binary search for the segment containing x
    let lo = 0, hi = points.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (points[mid].x <= x) lo = mid;
        else hi = mid;
    }

    const p1 = points[lo];
    const p2 = points[hi];
    const t = (x - p1.x) / (p2.x - p1.x);
    return p1.y + t * (p2.y - p1.y);
}
