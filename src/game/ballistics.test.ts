/// <reference types="node" />

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import Matter from 'matter-js';
import type { Side, Vector } from '../types';
import { cannonPosition, predictTrajectory, terrainHeight } from './ballistics';
import type { TrajectoryHazard } from './ballistics';

// The server package is CommonJS; load its reference fixtures without ESM named imports.
const require = createRequire(import.meta.url);
const {
    CANVAS_HEIGHT, WORLD_WIDTH, PROJECTILE_RADIUS, PROJECTILE_DENSITY,
    PROJECTILE_RESTITUTION, PROJECTILE_FRICTION, PROJECTILE_LIFESPAN_MS,
    PHYSICS_GRAVITY, PHYSICS_GRAVITY_SCALE, PHYSICS_AIR_FRICTION,
    PHYSICS_POWER_MULTIPLIER, PHYSICS_MAX_SPEED, WIND_STRENGTH,
} = require('../../server/config/constants.ts') as typeof import('../../server/config/constants');
const { generateTerrain } = require('../../server/physics/terrain.ts') as typeof import('../../server/physics/terrain');

const flat = [{ x: 0, y: 520 }, { x: 2400, y: 520 }];

// Independent reference: server projectile settings, midpoint callback, and Matter terrain.
function serverFlight({
    side = 'left', angle = Math.PI / 4, power = 50, origin = { x: 20, y: 500 },
    hazards = [], terrain = [],
}: {
    side?: Side;
    angle?: number;
    power?: number;
    origin?: Vector;
    hazards?: readonly TrajectoryHazard[];
    terrain?: Matter.Body[];
} = {}): { path: Vector[]; hit: boolean } {
    const engine = Matter.Engine.create();
    engine.gravity.y = PHYSICS_GRAVITY;
    engine.gravity.scale = PHYSICS_GRAVITY_SCALE;
    engine.enableSleeping = true;
    engine.positionIterations = 8;
    engine.velocityIterations = 6;
    const ball = Matter.Bodies.circle(origin.x, origin.y, PROJECTILE_RADIUS, {
        density: PROJECTILE_DENSITY, frictionAir: PHYSICS_AIR_FRICTION,
        restitution: PROJECTILE_RESTITUTION, friction: PROJECTILE_FRICTION,
        label: 'projectile',
    });
    const clampedAngle = Math.max(10 * Math.PI / 180, Math.min(170 * Math.PI / 180, angle));
    const clampedPower = Math.max(5, Math.min(100, power));
    const vx = (side === 'right' ? -1 : 1) * clampedPower * PHYSICS_POWER_MULTIPLIER * Math.cos(clampedAngle);
    const vy = -clampedPower * PHYSICS_POWER_MULTIPLIER * Math.sin(clampedAngle);
    const scale = Math.min(1, PHYSICS_MAX_SPEED / Math.hypot(vx, vy));
    Matter.Body.setVelocity(ball, { x: vx * scale, y: vy * scale });
    Matter.Composite.add(engine.world, [...terrain, ball]);

    let contact: Vector | undefined;
    Matter.Events.on(engine, 'collisionStart', event => {
        if (event.pairs.some(pair => pair.bodyA === ball || pair.bodyB === ball)) {
            contact = { ...ball.position };
        }
    });
    const path = [{ ...origin }];
    let stopped = false;
    for (let tick = 1; tick <= PROJECTILE_LIFESPAN_MS / (1000 / 60) && !stopped; tick++) {
        for (let half = 0; half < 2; half++) {
            Matter.Engine.update(engine, 1000 / 120);
            const point = contact ?? { ...ball.position };
            path.push(point);
            if (contact || point.x < -50 || point.x > WORLD_WIDTH + 50 || point.y > CANVAS_HEIGHT + 50) {
                stopped = true;
                break;
            }
            if (half !== 0) continue;
            const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
            if (speed > PHYSICS_MAX_SPEED) {
                Matter.Body.setVelocity(ball, {
                    x: ball.velocity.x * PHYSICS_MAX_SPEED / speed,
                    y: ball.velocity.y * PHYSICS_MAX_SPEED / speed,
                });
            }
            if (tick % 4 !== 0) continue;
            for (const hazard of hazards) {
                if (hazard.type !== 'wind_zone') continue;
                const { x, y } = hazard.position;
                if (ball.position.x < x || ball.position.x > x + hazard.width ||
                    ball.position.y < y || ball.position.y > y + hazard.height) continue;
                Matter.Body.applyForce(ball, ball.position, {
                    x: (hazard.windDirection ?? 1) * (hazard.windStrength ?? WIND_STRENGTH) * 1.6,
                    y: 0,
                });
            }
        }
    }
    Matter.Composite.clear(engine.world, false);
    Matter.Engine.clear(engine);
    return { path, hit: contact !== undefined };
}

function assertPath(actual: Vector[], expected: Vector[]): void {
    assert.equal(actual.length, expected.length);
    for (let i = 0; i < actual.length; i++) {
        assert.ok(Math.abs(actual[i].x - expected[i].x) < 1e-8, `x at half-step ${i}`);
        assert.ok(Math.abs(actual[i].y - expected[i].y) < 1e-8, `y at half-step ${i}`);
    }
}

test('terrain height interpolates, clamps edges, and supplies the server fallback', () => {
    const points = [{ x: 0, y: 500 }, { x: 100, y: 400 }, { x: 2400, y: 550 }];
    assert.equal(terrainHeight(points, 50), 450);
    assert.equal(terrainHeight(points, 100), 400);
    assert.equal(terrainHeight(points, -100), 500);
    assert.equal(terrainHeight(points, 2500), 550);
    assert.equal(terrainHeight([], 20), 500);
    assert.equal(terrainHeight([{ x: 10, y: 420 }], 20), 420);
    assert.deepEqual(cannonPosition('left', points), { x: 20, y: 460 });
    assert.deepEqual(cannonPosition('right', flat), { x: 2380, y: 500 });
    assert.deepEqual(cannonPosition('left', []), { x: 20, y: 480 });
});

test('free flight matches a separate server-like Matter simulation on both sides', () => {
    for (const side of ['left', 'right'] as const) {
        for (const [angle, power] of [[0.4, 25], [Math.PI / 2, 100], [2.7, 65]]) {
            const actual = predictTrajectory({ side, angle, power, terrainPoints: flat });
            const expected = serverFlight({ side, angle, power, origin: { x: side === 'left' ? 20 : 2380, y: 500 } }).path;
            // Ignore the reference's later flight below the terrain surface.
            assertPath(actual, expected.slice(0, actual.length));
            assert.ok(actual.length > 2);
            assert.deepEqual(actual[0], { x: side === 'left' ? 20 : 2380, y: 500 });
        }
    }
});

test('wind uses projectile mass, overlapping zones, defaults, and the midpoint fourth-tick force', () => {
    const hazards: TrajectoryHazard[] = [
        { type: 'wind_zone', position: { x: -50, y: -1000 }, width: 2500, height: 2000 },
        { type: 'wind_zone', position: { x: 80, y: 100 }, width: 120, height: 400, windDirection: -1, windStrength: 0.04 },
        { type: 'wind_zone', position: { x: 0, y: 1000 }, width: 2400, height: 100, windStrength: 1 },
        { type: 'lava_pool', position: { x: 0, y: 0 }, width: 2400, height: 600, windStrength: 1 },
    ];
    const options = { side: 'left' as const, angle: 0.3, power: 20, terrainPoints: flat };
    const actual = predictTrajectory({ ...options, hazards });
    const expected = serverFlight({ angle: options.angle, power: options.power, hazards }).path;
    assertPath(actual, expected.slice(0, actual.length));
    const calm = predictTrajectory(options);
    assertPath(actual.slice(0, 8), calm.slice(0, 8));
    assert.ok(actual[8].x < calm[8].x, 'first net leftward gust acts in frame 4, half-step 2');
    assert.ok(Math.abs(actual[20].x - calm[20].x) > 0.01);
});

test('wind includes the exact zone boundary and excludes non-wind hazards', () => {
    const reference = serverFlight({ angle: 0.3, power: 20 }).path;
    const options = { side: 'left' as const, angle: 0.3, power: 20, terrainPoints: flat };
    const hazard = { type: 'wind_zone', position: reference[7], width: 0, height: 0, windStrength: 0.1 };
    const calm = predictTrajectory(options);
    const windy = predictTrajectory({ ...options, hazards: [hazard] });
    assertPath(windy.slice(0, 8), calm.slice(0, 8));
    assert.ok(windy[8].x > calm[8].x);
    assertPath(windy, serverFlight({ angle: 0.3, power: 20, hazards: [hazard] }).path.slice(0, windy.length));
    assertPath(predictTrajectory({ ...options, hazards: [{ ...hazard, type: 'falling_rocks' }] }), calm);
});

test('caps wind-accelerated velocity at the server midpoint, not each half-step', () => {
    const hazards = [{
        type: 'wind_zone', position: { x: -5000, y: -100000 }, width: 10000, height: 200000,
        windStrength: 150,
    }];
    const actual = predictTrajectory({
        side: 'left', angle: Math.PI / 2, power: 5,
        terrainPoints: [{ x: 0, y: -50000 }], hazards,
    });
    assertPath(actual, serverFlight({ angle: Math.PI / 2, power: 5, origin: { x: 20, y: -50020 }, hazards }).path);
    assert.ok(actual[9].x - actual[8].x > 500, 'first half-step retains the preceding gust velocity');
    assert.ok(actual[10].x - actual[9].x < 500, 'midpoint speed cap limits the second half-step');
});

test('stops at the first radius-aware Matter terrain collision without predicting the bounce', () => {
    const terrain = generateTerrain({ seed: 42, width: 2400, height: 600, baseHeight: 520, amplitude: 0 });
    const reference = serverFlight({ angle: 0.25, power: 15, terrain: terrain.bodies });
    const actual = predictTrajectory({ side: 'left', angle: 0.25, power: 15, terrainPoints: terrain.points });
    assert.equal(reference.hit, true);
    assertPath(actual, reference.path);
    assert.ok(actual[actual.length - 1].y < 520, 'projectile radius touches before its center reaches the ground');
    assert.ok(actual[actual.length - 1].y > actual[actual.length - 2].y, 'terminal sample is the incoming hit');
});

test('matches the first server terrain hit on a slope', () => {
    const terrain = generateTerrain({ seed: 123, width: 2400, height: 600, resolution: 25, amplitude: 60 });
    const origin = { x: 20, y: terrain.points[0].y + (terrain.points[1].y - terrain.points[0].y) * 20 / 25 - 20 };
    const reference = serverFlight({ angle: 0.35, power: 18, origin, terrain: terrain.bodies });
    const actual = predictTrajectory({ side: 'left', angle: 0.35, power: 18, terrainPoints: terrain.points });
    assert.equal(reference.hit, true);
    assertPath(actual, reference.path);
});

test('mirrors both sides, including reversed wind direction and asymmetric terrain', () => {
    const terrain = generateTerrain({ seed: 7, width: 2400, height: 600, resolution: 25 });
    const hazards: TrajectoryHazard[] = [{
        type: 'wind_zone', position: { x: 0, y: 0 }, width: 2400, height: 600,
        windDirection: 1, windStrength: 0.02,
    }];
    const left = predictTrajectory({ side: 'left', angle: 0.5, power: 25, terrainPoints: terrain.points, hazards });
    const right = predictTrajectory({
        side: 'right', angle: 0.5, power: 25,
        terrainPoints: terrain.points.map(point => ({ x: 2400 - point.x, y: point.y })).reverse(),
        hazards: hazards.map(hazard => ({ ...hazard, windDirection: -1 })),
    });
    assertPath(right, left.map(point => ({ x: 2400 - point.x, y: point.y })));
});

test('clamps radians to 10..170 degrees and power to 5..100 like the server', () => {
    for (const [angle, power, clampedAngle, clampedPower] of [
        [-10, -100, Math.PI / 18, 5], [10, 1000, 17 * Math.PI / 18, 100],
    ]) {
        const options = { side: 'left' as const, terrainPoints: flat };
        assertPath(
            predictTrajectory({ ...options, angle, power }),
            predictTrajectory({ ...options, angle: clampedAngle, power: clampedPower }),
        );
    }
    for (const value of [NaN, Infinity, -Infinity]) {
        assert.deepEqual(predictTrajectory({ side: 'left', angle: value, power: 50, terrainPoints: flat }), []);
        assert.deepEqual(predictTrajectory({ side: 'left', angle: 1, power: value, terrainPoints: flat }), []);
    }
});

test('stops on either horizontal removal bound without adding another half-step', () => {
    for (const side of ['left', 'right'] as const) {
        const actual = predictTrajectory({ side, angle: 2.8, power: 100, terrainPoints: flat });
        const last = actual[actual.length - 1];
        const previous = actual[actual.length - 2];
        assert.ok(side === 'left' ? last.x < -50 : last.x > 2450);
        assert.ok(previous.x >= -50 && previous.x <= 2450);
        assertPath(actual, serverFlight({ side, angle: 2.8, power: 100, origin: { x: side === 'left' ? 20 : 2380, y: 500 } }).path);
    }
});

test('stops at the lower removal bound with no terrain segments', () => {
    const actual = predictTrajectory({ side: 'left', angle: Math.PI / 2, power: 5, terrainPoints: [] });
    assert.ok(actual[actual.length - 1].y > 650);
    assert.ok(actual[actual.length - 2].y <= 650);
    assertPath(actual, serverFlight({ angle: Math.PI / 2, power: 5, origin: { x: 20, y: 480 } }).path);
});

test('is bounded to five seconds and does not mutate caller-owned terrain or hazards', () => {
    const terrainPoints = Object.freeze([Object.freeze({ x: 0, y: -50000 })]);
    const hazards = Object.freeze([Object.freeze({
        type: 'wind_zone', position: Object.freeze({ x: 0, y: 0 }), width: 2400, height: 600,
    })]);
    const options = { side: 'left' as const, angle: Math.PI / 2, power: 5, terrainPoints, hazards };
    const first = predictTrajectory(options);
    assert.equal(first.length, 601, 'origin plus 600 half-step samples');
    assertPath(first, serverFlight({ angle: Math.PI / 2, power: 5, origin: { x: 20, y: -50020 } }).path);
    first[0].x = 999;
    assert.equal(predictTrajectory(options)[0].x, 20);
    assert.equal(terrainPoints[0].x, 0);

    const frozenGround = Object.freeze(flat.map(point => Object.freeze({ ...point })));
    const groundPath = predictTrajectory({ ...options, terrainPoints: frozenGround });
    assertPath(groundPath, predictTrajectory({ ...options, terrainPoints: frozenGround }));
    assert.deepEqual(frozenGround, flat);
});
