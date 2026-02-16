import Matter from 'matter-js';
import type { BodyPlan } from './schema';

const MAX_SHIFT_ATTEMPTS = 10;
const SHIFT_PX = 5;

interface SafeSpawnResult {
    adjustedBodies: BodyPlan[];
    adjustmentCount: number;
}

/**
 * Checks AI-generated body plans for overlaps with terrain, existing world bodies
 * (including King), and previously placed ghost bodies. Shifts overlapping bodies
 * upward until they no longer collide (max 10 attempts / 50px).
 */
export function safeSpawn(plans: BodyPlan[], existingWorld: Matter.World): SafeSpawnResult {
    // Create a temporary engine/world for ghost collision detection
    const ghostEngine = Matter.Engine.create();
    const ghostWorld = ghostEngine.world;
    ghostEngine.gravity.y = 0; // No gravity in ghost world

    // Clone all existing world bodies as static ghosts for collision testing
    const existingBodies = Matter.Composite.allBodies(existingWorld);
    for (const body of existingBodies) {
        const clone = Matter.Bodies.fromVertices(
            body.position.x,
            body.position.y,
            body.vertices.map(v => [v]),
            { isStatic: true, label: body.label }
        );
        if (clone) {
            Matter.World.add(ghostWorld, clone);
        }
    }

    let totalAdjustments = 0;
    const adjustedBodies: BodyPlan[] = [];

    for (const plan of plans) {
        let { x, y } = plan;
        let adjusted = false;

        for (let attempt = 0; attempt < MAX_SHIFT_ATTEMPTS; attempt++) {
            const ghostBody = createGhostBody(plan, x, y);
            const collisions = Matter.Query.collides(ghostBody, Matter.Composite.allBodies(ghostWorld));

            if (collisions.length === 0) {
                // No collision — place the ghost body for future collision checks
                const permanentGhost = createGhostBody(plan, x, y);
                Matter.Body.setStatic(permanentGhost, true);
                Matter.World.add(ghostWorld, permanentGhost);
                break;
            }

            // Shift upward
            y -= SHIFT_PX;
            adjusted = true;

            if (attempt === MAX_SHIFT_ATTEMPTS - 1) {
                // Last attempt — place anyway at adjusted position
                const permanentGhost = createGhostBody(plan, x, y);
                Matter.Body.setStatic(permanentGhost, true);
                Matter.World.add(ghostWorld, permanentGhost);
            }
        }

        if (adjusted) totalAdjustments++;
        adjustedBodies.push({ ...plan, x, y });
    }

    // Clean up ghost world
    Matter.World.clear(ghostWorld, false);
    Matter.Engine.clear(ghostEngine);

    return { adjustedBodies, adjustmentCount: totalAdjustments };
}

function createGhostBody(plan: BodyPlan, x: number, y: number): Matter.Body {
    let body: Matter.Body;

    if (plan.shape === 'circle') {
        const radius = plan.dimensions[0] || 25;
        body = Matter.Bodies.circle(x, y, radius, { isStatic: true });
    } else if (plan.shape === 'triangle') {
        const size = plan.dimensions[0] || 50;
        const vertices = [
            { x: 0, y: -size / 2 },
            { x: -size / 2, y: size / 2 },
            { x: size / 2, y: size / 2 },
        ];
        body = Matter.Bodies.fromVertices(x, y, [vertices], { isStatic: true });
    } else {
        const w = plan.dimensions[0] || 50;
        const h = plan.dimensions[1] || plan.dimensions[0] || 50;
        body = Matter.Bodies.rectangle(x, y, w, h, { isStatic: true });
    }

    if (plan.angle) Matter.Body.setAngle(body, plan.angle);
    return body;
}
