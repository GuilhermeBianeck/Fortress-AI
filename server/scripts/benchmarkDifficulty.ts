import Matter from 'matter-js';
import { BotAI } from '../game/BotAI';
import { closestOnSegment, type BallisticsScene } from '../game/botBallistics';
import { createWorld } from '../physics/world';
import { applyWindForce } from '../physics/hazards';
import { BOT_DIFFICULTIES, type BotDifficulty } from '../shared/difficulty';
import { kingCannonX } from '../shared/battleLayout';
import type { Side } from '../types';
import { PHYSICS_AIR_FRICTION, PHYSICS_POWER_MULTIPLIER, PROJECTILE_RADIUS, PROJECTILE_DENSITY, PROJECTILE_RESTITUTION, PROJECTILE_FRICTION } from '../config/constants';

function random(seed: number) { return () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; }; }
function scene(seed: number, side: Side, turn: number): BallisticsScene {
    const world = createWorld(seed);
    const height = (x: number) => {
        const points = world.terrain.points; const index = Math.min(points.length - 2, Math.floor(x / 25));
        const a = points[index], b = points[index + 1]; return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
    };
    const mirror = (x: number) => side === 'left' ? x : 2400 - x;
    const targetX = mirror(1800 + seed % 81 - (turn >= 3 ? 160 : 0));
    const target = Matter.Bodies.rectangle(targetX, height(targetX) - 32, 32, 64, { label: 'king', isStatic: true });
    const bodies = [...Matter.Composite.allBodies(world.world), target];
    if (seed % 3 === 0) {
        const x = mirror(1600 + seed % 81 - (turn >= 3 ? 160 : 0));
        bodies.push(Matter.Bodies.rectangle(x, height(x) - 45, 24, 90, { label: 'stone', isStatic: true }));
    }
    const cannonX = kingCannonX(side, mirror(600));
    return { side, cannon: { x: cannonX, y: height(cannonX) - 20 }, target: { ...target.position }, targetBodyId: target.id,
        bodies, gravity: { ...world.engine.gravity }, windTick: seed % 4,
        wind: [{ id: 'benchmark-wind', type: 'wind_zone', position: { x: 0, y: 0 }, width: 2400, height: 600,
            windDirection: turn >= 3 ? -1 : 1, windStrength: 0.0003 + (seed % 5) * 0.0001 }] };
}

// A separate engine replays the accepted shot. Solver predictions are not feedback.
function replay(scene: BallisticsScene, angle: number, power: number) {
    const engine = Matter.Engine.create({ positionIterations: 8, velocityIterations: 6 });
    Object.assign(engine.gravity, scene.gravity);
    const ball = Matter.Bodies.circle(scene.cannon.x, scene.cannon.y, PROJECTILE_RADIUS, {
        label: 'projectile', density: PROJECTILE_DENSITY, frictionAir: PHYSICS_AIR_FRICTION,
        restitution: PROJECTILE_RESTITUTION, friction: PROJECTILE_FRICTION,
    });
    const speed = power * PHYSICS_POWER_MULTIPLIER;
    Matter.Body.setVelocity(ball, { x: (scene.side === 'left' ? 1 : -1) * speed * Math.cos(angle), y: -speed * Math.sin(angle) });
    Matter.Composite.add(engine.world, [...scene.bodies, ball]);
    let closest = { ...ball.position }, previous = closest, distance = Infinity;
    let hit: Matter.Body | undefined;
    Matter.Events.on(engine, 'beforeSolve', () => {
        const point = closestOnSegment(previous, ball.position, scene.target);
        const nextDistance = Math.hypot(point.x - scene.target.x, point.y - scene.target.y);
        if (nextDistance < distance) { closest = point; distance = nextDistance; }
        previous = { ...ball.position };
    });
    Matter.Events.on(engine, 'collisionStart', event => {
        for (const pair of event.pairs) {
            if (pair.bodyA === ball) hit = pair.bodyB; else if (pair.bodyB === ball) hit = pair.bodyA;
        }
    });
    for (let step = 0; step < 600 && !hit; step++) {
        Matter.Engine.update(engine, 1000 / 120);
        if (step % 2 === 0 && (scene.windTick + (step >> 1) + 1) % 4 === 0) applyWindForce([ball], scene.wind, 4);
    }
    Matter.Composite.clear(engine.world, false); Matter.Engine.clear(engine);
    return { closest, distance, hitLabel: hit?.label, hitBodyId: hit?.id };
}
interface Sample { seed: number; side: Side; turn: number; distance: number; hit: boolean; solveMs: number }
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
export function benchmarkDifficulty() {
    const samples: Record<BotDifficulty, Sample[]> = { easy: [], normal: [], hard: [] };
    for (let seedIndex = 0; seedIndex < 12; seedIndex++) for (const side of ['left', 'right'] as const) for (const difficulty of BOT_DIFFICULTIES) {
        const seed = 42 + seedIndex * 1729;
        let current = scene(seed, side, 0), shot: { id: number; angle: number; power: number } | undefined, nextId = 0;
        const bot = new BotAI(side, { random: random(seed), getKingPosition: () => current.target, getFoundationTopY: () => current.target.y + 32,
            getBallisticsScene: () => current, canBuild: () => true, canFire: () => true, spawnBlock: () => {},
            fireProjectile: (_side, angle, power) => { shot = { id: ++nextId, angle, power }; return nextId; } }, difficulty);
        for (let turn = 0; turn < 6; turn++) {
            current = scene(seed, side, turn);
            const start = performance.now(); bot.fireTurn(); const solveMs = performance.now() - start;
            if (!shot) throw new Error('Benchmark shot was not accepted');
            const actual = replay(current, shot.angle, shot.power);
            bot.observeShot({ projectileId: shot.id, ...actual });
            samples[difficulty].push({ seed, side, turn, solveMs, distance: actual.distance, hit: actual.hitBodyId === current.targetBodyId });
        }
        bot.destroy();
    }
    const summary = Object.fromEntries(BOT_DIFFICULTIES.map(difficulty => {
        const rows = samples[difficulty], early = rows.filter(s => s.turn < 2), late = rows.filter(s => s.turn >= 4), times = rows.map(s => s.solveMs);
        return [difficulty, { shots: rows.length, earlyDistance: mean(early.map(s => s.distance)), lateDistance: mean(late.map(s => s.distance)),
            earlyHitFraction: mean(early.map(s => Number(s.hit))), lateHitFraction: mean(late.map(s => Number(s.hit))),
            solveP50: percentile(times, 0.5), solveP95: percentile(times, 0.95), solveMax: Math.max(...times) }];
    }));
    return { generatedAt: new Date().toISOString(), seeds: 12, sides: 2, shotsPerScenario: 6, world: 'procedural terrain, 32x64 kings, ceiling, wind reversal and 160px target movement after shot 3; stone cover in 4/12 seeds', summary, samples };
}
if (require.main === module) console.log(JSON.stringify(benchmarkDifficulty(), null, 2));
