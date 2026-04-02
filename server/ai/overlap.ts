import Matter from 'matter-js';
import type { BodyPlan } from './schema';

const MAX_SHIFT_ATTEMPTS = 10;
const SHIFT_PX = 5;

interface SafeSpawnResult {
    adjustedBodies: BodyPlan[];
    adjustmentCount: number;
}

interface AABB {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

function bodyToAABB(body: Matter.Body): AABB {
    return {
        minX: body.bounds.min.x,
        minY: body.bounds.min.y,
        maxX: body.bounds.max.x,
        maxY: body.bounds.max.y,
    };
}

function planToAABB(plan: BodyPlan, x: number, y: number): AABB {
    if (plan.shape === 'circle') {
        const r = plan.dimensions[0] || 15;
        return { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r };
    }
    const w = plan.dimensions[0] || 30;
    const h = plan.dimensions[1] || plan.dimensions[0] || 30;
    // For rotated rectangles, use the bounding box of the rotated shape
    if (plan.angle) {
        const cos = Math.abs(Math.cos(plan.angle));
        const sin = Math.abs(Math.sin(plan.angle));
        const rw = (w * cos + h * sin) / 2;
        const rh = (w * sin + h * cos) / 2;
        return { minX: x - rw, minY: y - rh, maxX: x + rw, maxY: y + rh };
    }
    return { minX: x - w / 2, minY: y - h / 2, maxX: x + w / 2, maxY: y + h / 2 };
}

function aabbOverlap(a: AABB, b: AABB): boolean {
    return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

/**
 * Checks AI-generated body plans for overlaps with terrain, existing world bodies
 * (including King), and previously placed bodies using pure AABB math.
 * Shifts overlapping bodies upward until they no longer collide (max 10 attempts / 50px).
 */
export function safeSpawn(plans: BodyPlan[], existingWorld: Matter.World): SafeSpawnResult {
    // Collect AABBs from all existing world bodies
    const existingBodies = Matter.Composite.allBodies(existingWorld);
    const occupied: AABB[] = existingBodies.map(bodyToAABB);

    let totalAdjustments = 0;
    const adjustedBodies: BodyPlan[] = [];

    for (const plan of plans) {
        const { x } = plan;
        let y = plan.y;
        let adjusted = false;

        for (let attempt = 0; attempt < MAX_SHIFT_ATTEMPTS; attempt++) {
            const aabb = planToAABB(plan, x, y);
            const hasCollision = occupied.some(occ => aabbOverlap(aabb, occ));

            if (!hasCollision) {
                occupied.push(aabb);
                break;
            }

            // Shift upward
            y -= SHIFT_PX;
            adjusted = true;

            if (attempt === MAX_SHIFT_ATTEMPTS - 1) {
                // Last attempt -- place anyway at adjusted position
                occupied.push(planToAABB(plan, x, y));
            }
        }

        if (adjusted) totalAdjustments++;
        adjustedBodies.push({ ...plan, x, y });
    }

    return { adjustedBodies, adjustmentCount: totalAdjustments };
}
