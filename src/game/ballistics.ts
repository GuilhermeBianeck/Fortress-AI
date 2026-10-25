import Matter from 'matter-js';
import type { Side, Vector } from '../types';
import { CANVAS_HEIGHT, LEFT_CANNON_X, RIGHT_CANNON_X, WORLD_WIDTH } from '../types';

export interface TrajectoryHazard {
    type: string;
    position: Vector;
    width: number;
    height: number;
    windDirection?: number;
    windStrength?: number;
}

export interface TrajectoryOptions {
    side: Side;
    /** Launch angle in radians, mirrored horizontally for the right side. */
    angle: number;
    power: number;
    /** Surface samples in ascending x order, as supplied by the server. */
    terrainPoints: readonly Vector[];
    hazards?: readonly TrajectoryHazard[];
    cannons?: Partial<Record<Side, Vector>>;
}

// Keep these aligned with server/config/constants.ts and the server's 60 Hz loop.
const FRAME_MS = 1000 / 60;
const MAX_FRAMES = 300;
const MAX_SPEED = 1000;
const WIND_STRENGTH = 0.0005;

export function terrainHeight(points: readonly Vector[], x: number): number {
    if (points.length === 0) return 500;
    if (x <= points[0].x) return points[0].y;
    if (x >= points[points.length - 1].x) return points[points.length - 1].y;

    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (points[mid].x <= x) lo = mid;
        else hi = mid;
    }
    const start = points[lo];
    const end = points[hi];
    return start.y + ((x - start.x) / (end.x - start.x)) * (end.y - start.y);
}

export function cannonPosition(side: Side, points: readonly Vector[], cannons?: Partial<Record<Side, Vector>>): Vector {
    if (cannons?.[side]) return { ...cannons[side] };
    const x = side === 'left' ? LEFT_CANNON_X : RIGHT_CANNON_X;
    return { x, y: terrainHeight(points, x) - 20 };
}

function terrainBodies(points: readonly Vector[]): Matter.Body[] {
    const bottom = CANVAS_HEIGHT + 50;
    const bodies: Matter.Body[] = [];
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        // Match createTerrainSegments, including its fromVertices placement.
        bodies.push(Matter.Bodies.fromVertices(
            (a.x + b.x) / 2, (Math.min(a.y, b.y) + bottom) / 2,
            [[a, b, { x: b.x, y: bottom }, { x: a.x, y: bottom }]],
            { isStatic: true, label: 'Terrain', friction: 2 },
        ));
    }
    return bodies;
}

function outsideWorld(position: Vector): boolean {
    return position.x < -50 || position.x > WORLD_WIDTH + 50 || position.y > CANVAS_HEIGHT + 50;
}

/** Origin plus half-step centers, ending at first terrain contact, bounds exit, or 5 s.
 * Only terrain and wind are predicted, not live blocks, walls, or falling rocks.
 * The server's hazard-tick phase is not sent to clients; tick 4 is the first gust.
 */
export function predictTrajectory({
    side, angle: rawAngle, power: rawPower, terrainPoints, hazards = [], cannons,
}: TrajectoryOptions): Vector[] {
    if (!Number.isFinite(rawAngle) || !Number.isFinite(rawPower)) return [];

    const angle = Math.max(Math.PI / 18, Math.min(17 * Math.PI / 18, rawAngle));
    const power = Math.max(5, Math.min(100, rawPower));
    const origin = cannonPosition(side, terrainPoints, cannons);
    const engine = Matter.Engine.create();
    engine.gravity.x = 0;
    engine.gravity.y = 2;
    engine.gravity.scale = 0.001;
    engine.enableSleeping = true;
    engine.positionIterations = 8;
    engine.velocityIterations = 6;

    const projectile = Matter.Bodies.circle(origin.x, origin.y, 9, {
        density: 0.08,
        restitution: 0.1,
        friction: 0.3,
        frictionAir: 0.005,
        label: 'projectile',
    });
    const direction = side === 'right' ? -1 : 1;
    const speedScale = Math.min(1, MAX_SPEED / power);
    Matter.Body.setVelocity(projectile, {
        x: direction * power * Math.cos(angle) * speedScale,
        y: -power * Math.sin(angle) * speedScale,
    });
    Matter.Composite.add(engine.world, [...terrainBodies(terrainPoints), projectile]);

    let impact: Vector | undefined;
    Matter.Events.on(engine, 'collisionStart', event => {
        if (event.pairs.some(pair => pair.bodyA === projectile || pair.bodyB === projectile)) {
            // collisionStart precedes resolution: retain the first contact, not its bounce.
            impact = { ...projectile.position };
        }
    });

    const path: Vector[] = [origin];
    const wind = hazards.filter(hazard => hazard.type === 'wind_zone');
    const step = (): boolean => {
        Matter.Engine.update(engine, FRAME_MS / 2);
        const point = impact ?? { ...projectile.position };
        path.push(point);
        return impact !== undefined || outsideWorld(point);
    };

    try {
        for (let frame = 1; frame <= MAX_FRAMES; frame++) {
            if (step()) break;

            // GameLoop runs checkProjectileBounds then tickHazards BETWEEN half-steps.
            const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y);
            if (speed > MAX_SPEED) {
                Matter.Body.setVelocity(projectile, {
                    x: projectile.velocity.x * MAX_SPEED / speed,
                    y: projectile.velocity.y * MAX_SPEED / speed,
                });
            }
            if (frame % 4 === 0) {
                for (const hazard of wind) {
                    const { x, y } = projectile.position;
                    if (x >= hazard.position.x && x <= hazard.position.x + hazard.width &&
                        y >= hazard.position.y && y <= hazard.position.y + hazard.height) {
                        Matter.Body.applyForce(projectile, projectile.position, {
                            x: (hazard.windDirection ?? 1) * (hazard.windStrength ?? WIND_STRENGTH) * 0.4 * 4,
                            y: 0,
                        });
                    }
                }
            }
            if (step()) break;
        }
        return path;
    } finally {
        Matter.Events.off(engine, 'collisionStart');
        Matter.Composite.clear(engine.world, false);
        Matter.Engine.clear(engine);
    }
}
