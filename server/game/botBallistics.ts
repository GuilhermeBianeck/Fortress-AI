import Matter from 'matter-js';
import type { HazardData, Side } from '../types';
import {
    CANVAS_HEIGHT, WORLD_WIDTH, PHYSICS_AIR_FRICTION, PHYSICS_POWER_MULTIPLIER,
    PROJECTILE_RADIUS, PROJECTILE_DENSITY, PROJECTILE_RESTITUTION, PROJECTILE_FRICTION,
    PROJECTILE_LIFESPAN_MS, WIND_STRENGTH,
} from '../config/constants';
import { applyWindForce } from '../physics/hazards';

export interface BallisticsScene {
    side: Side;
    cannon: Matter.Vector;
    target: Matter.Vector;
    targetBodyId: number;
    gravity: { x: number; y: number; scale: number };
    wind: HazardData[];
    windTick: number;
    bodies: Matter.Body[];
}

export interface FlightPrediction {
    closest: Matter.Vector;
    position: Matter.Vector;
    hitLabel?: string;
    hitBodyId?: number;
}

export interface BotShotPlan {
    angle: number;
    power: number;
    target: Matter.Vector;
    prediction: FlightPrediction;
}

const HALF_DT = 1000 / 120;
const STEPS = Math.ceil(PROJECTILE_LIFESPAN_MS / HALF_DT);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function closestOnSegment(a: Matter.Vector, b: Matter.Vector, target: Matter.Vector): Matter.Vector {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((target.x - a.x) * dx + (target.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return { x: a.x + dx * t, y: a.y + dy * t };
}

function makeProjectile(scene: BallisticsScene, angle: number, power: number): Matter.Body {
    const ball = Matter.Bodies.circle(scene.cannon.x, scene.cannon.y, PROJECTILE_RADIUS, {
        label: 'projectile', density: PROJECTILE_DENSITY, frictionAir: PHYSICS_AIR_FRICTION,
        friction: PROJECTILE_FRICTION, restitution: PROJECTILE_RESTITUTION,
    });
    const direction = scene.side === 'left' ? 1 : -1;
    Matter.Body.setVelocity(ball, {
        x: direction * power * PHYSICS_POWER_MULTIPLIER * Math.cos(angle),
        y: -power * PHYSICS_POWER_MULTIPLIER * Math.sin(angle),
    });
    return ball;
}

// Cheap inverse search uses Matter's exact half-step Verlet recurrence. Only six
// finalists enter the real collision solver; live world bodies are never simulated.
function crossing(scene: BallisticsScene, angle: number, power: number, target: Matter.Vector, mass: number) {
    const direction = scene.side === 'left' ? 1 : -1;
    let x = scene.cannon.x, y = scene.cannon.y;
    let vx = direction * power * PHYSICS_POWER_MULTIPLIER * Math.cos(angle) / 2;
    let vy = -power * PHYSICS_POWER_MULTIPLIER * Math.sin(angle) / 2;
    let minY = y, pendingWind = 0;
    for (let step = 0; step < STEPS; step++) {
        const previousX = x, previousY = y;
        vx = vx * (1 - PHYSICS_AIR_FRICTION / 2) + (scene.gravity.x * scene.gravity.scale + pendingWind / mass) * HALF_DT ** 2;
        vy = vy * (1 - PHYSICS_AIR_FRICTION / 2) + scene.gravity.y * scene.gravity.scale * HALF_DT ** 2;
        x += vx;
        y += vy;
        minY = Math.min(minY, y);
        pendingWind = 0;
        if (step % 2 === 0 && (scene.windTick + (step >> 1) + 1) % 4 === 0) {
            for (const wind of scene.wind) {
                if (x >= wind.position.x && x <= wind.position.x + wind.width &&
                    y >= wind.position.y && y <= wind.position.y + wind.height) {
                    pendingWind += (wind.windDirection ?? 1) * (wind.windStrength ?? WIND_STRENGTH) * 0.4 * 4;
                }
            }
        }
        if (direction * (x - target.x) >= 0) {
            const t = (target.x - previousX) / (x - previousX || 1);
            return { error: previousY + (y - previousY) * t - target.y, minY };
        }
    }
    return { error: 10000 + Math.abs(target.x - x), minY };
}

function frozenBody(body: Matter.Body): Matter.Body {
    const options = { isStatic: true, label: body.label, collisionFilter: { ...body.collisionFilter } };
    if (body.circleRadius) return Matter.Bodies.circle(body.position.x, body.position.y, body.circleRadius, options);
    const parts = body.parts.length > 1 ? body.parts.slice(1) : [body];
    return Matter.Bodies.fromVertices(body.position.x, body.position.y,
        parts.map(part => part.vertices.map(vertex => ({ x: vertex.x, y: vertex.y }))), options, true);
}

// Near-equal open-air scores would otherwise pick six neighbouring flat angles that one
// wall blocks together; spreading finalists across the reachable arc keeps a lob in play.
function spreadFinalists<T extends { angle: number; score: number }>(candidates: T[], count: number): T[] {
    const reachable = candidates.filter(c => c.score < 50).sort((a, b) => a.angle - b.angle);
    const picked = new Set<T>();
    for (let i = 0; i < count && reachable.length; i++) {
        picked.add(reachable[Math.round(i * (reachable.length - 1) / Math.max(1, count - 1))]);
    }
    for (const c of [...candidates].sort((a, b) => a.score - b.score)) {
        if (picked.size >= count) break;
        picked.add(c);
    }
    return [...picked].sort((a, b) => a.score - b.score);
}

export function findBotShot(scene: BallisticsScene, aimOffsetX: number): BotShotPlan {
    const deadline = performance.now() + 75;
    const direction = scene.side === 'left' ? 1 : -1;
    const target = {
        x: clamp(scene.target.x + aimOffsetX, PROJECTILE_RADIUS * 2, WORLD_WIDTH - PROJECTILE_RADIUS * 2),
        y: scene.target.y,
    };
    const mass = makeProjectile(scene, 0, 5).mass;
    const candidates: { angle: number; power: number; score: number }[] = [];
    for (let degrees = 10; degrees <= 80; degrees += 5) {
        const angle = degrees * Math.PI / 180;
        let low = 5, high = 100;
        for (let i = 0; i < 9; i++) {
            const power = (low + high) / 2;
            if (crossing(scene, angle, power, target, mass).error > 0) low = power;
            else high = power;
        }
        const power = (low + high) / 2;
        const flight = crossing(scene, angle, power, target, mass);
        candidates.push({ angle, power, score: Math.abs(flight.error) + (flight.minY < PROJECTILE_RADIUS ? 2000 : 0) + power * 0.02 });
    }
    const engine = Matter.Engine.create({ positionIterations: 8, velocityIterations: 6 });
    Object.assign(engine.gravity, scene.gravity);
    const sourceIds = new Map<number, number>();
    const obstacles = scene.bodies.filter(body => body.label !== 'projectile' &&
        Matter.Detector.canCollide(body.collisionFilter, { category: 1, mask: 0xFFFFFFFF, group: 0 }));
    for (const body of obstacles) {
        const clone = frozenBody(body);
        sourceIds.set(clone.id, body.id);
        Matter.Composite.add(engine.world, clone);
    }
    let best: BotShotPlan | undefined;
    let bestScore = Infinity;
    for (const candidate of spreadFinalists(candidates, 6)) {
        if (best && performance.now() >= deadline) break;
        const ball = makeProjectile(scene, candidate.angle, candidate.power);
        Matter.Composite.add(engine.world, ball);
        let previous = { ...ball.position };
        let closest = previous;
        let distance = Infinity;
        let impact: Matter.Body | undefined;
        const updateClosest = () => {
            const point = closestOnSegment(previous, ball.position, target);
            const nextDistance = Math.hypot(point.x - target.x, point.y - target.y);
            if (nextDistance < distance) { closest = point; distance = nextDistance; }
            previous = { ...ball.position };
        };
        const onCollision = (event: Matter.IEventCollision<Matter.Engine>) => {
            for (const pair of event.pairs) {
                if (pair.bodyA === ball) impact = pair.bodyB;
                else if (pair.bodyB === ball) impact = pair.bodyA;
            }
            updateClosest();
        };
        Matter.Events.on(engine, 'collisionStart', onCollision);
        for (let step = 0; step < STEPS && !impact; step++) {
            Matter.Engine.update(engine, HALF_DT);
            updateClosest();
            if (step % 2 === 0 && (scene.windTick + (step >> 1) + 1) % 4 === 0) {
                applyWindForce([ball], scene.wind, 4);
            }
            if (ball.position.y > CANVAS_HEIGHT + 50 || direction * (ball.position.x - target.x) > 250) break;
            if (best && performance.now() >= deadline) break;
        }
        const score = distance + (impact?.label === 'Boundary' ? 160 : 0);
        if (score < bestScore) {
            bestScore = score;
            best = {
                angle: candidate.angle, power: candidate.power, target: { ...scene.target },
                prediction: { closest, position: { ...ball.position }, hitLabel: impact?.label,
                    hitBodyId: impact ? sourceIds.get(impact.id) : undefined },
            };
        }
        Matter.Events.off(engine, 'collisionStart', onCollision);
        Matter.Composite.remove(engine.world, ball);
        Matter.Engine.clear(engine);
    }
    Matter.Composite.clear(engine.world, false);
    return best!;
}
