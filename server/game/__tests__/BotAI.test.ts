import { afterEach, describe, expect, it, vi } from 'vitest';
import Matter from 'matter-js';
import { BotAI, type BotAIDeps } from '../BotAI';
import { closestOnSegment, findBotShot, type BallisticsScene } from '../botBallistics';
import { applyWindForce } from '../../physics/hazards';
import type { Side } from '../../types';
import type { Server } from 'socket.io';
import { GameSession } from '../GameSession';
import {
    BOT_FIRE_DELAY_MS, BOT_BUILD_DELAY_MS, PHYSICS_AIR_FRICTION, PHYSICS_POWER_MULTIPLIER,
    PROJECTILE_RADIUS, PROJECTILE_DENSITY, PROJECTILE_RESTITUTION, PROJECTILE_FRICTION,
} from '../../config/constants';

function seededRandom(seed: number) {
    return () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
}

function sceneFor(side: Side, targetX = 1800, windDirection = 1): BallisticsScene {
    const mirror = (x: number) => side === 'left' ? x : 2400 - x;
    const target = Matter.Bodies.circle(mirror(targetX), 480, 12, { label: 'king', isStatic: true });
    return {
        side, cannon: { x: mirror(20), y: 500 }, target: { ...target.position }, targetBodyId: target.id,
        gravity: { x: 0, y: 2, scale: 0.001 }, windTick: 2,
        wind: [{ id: 'wind', type: 'wind_zone', position: { x: 0, y: 0 }, width: 2400, height: 600,
            windDirection, windStrength: 0.0007 }],
        bodies: [target,
            Matter.Bodies.rectangle(1200, 570, 2400, 60, { isStatic: true, label: 'Terrain' }),
            Matter.Bodies.rectangle(1200, -25, 2500, 50, { isStatic: true, label: 'Boundary' })],
    };
}

// Independent replay in a real Matter engine: no predicted outcome is fed back.
function observeLiveShot(scene: BallisticsScene, angle: number, power: number) {
    const engine = Matter.Engine.create({ positionIterations: 8, velocityIterations: 6 });
    Object.assign(engine.gravity, scene.gravity);
    const ball = Matter.Bodies.circle(scene.cannon.x, scene.cannon.y, PROJECTILE_RADIUS, {
        label: 'projectile', density: PROJECTILE_DENSITY, frictionAir: PHYSICS_AIR_FRICTION,
        restitution: PROJECTILE_RESTITUTION, friction: PROJECTILE_FRICTION,
    });
    Matter.Body.setVelocity(ball, {
        x: (scene.side === 'left' ? 1 : -1) * power * PHYSICS_POWER_MULTIPLIER * Math.cos(angle),
        y: -power * PHYSICS_POWER_MULTIPLIER * Math.sin(angle),
    });
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
            if (pair.bodyA === ball) hit = pair.bodyB;
            else if (pair.bodyB === ball) hit = pair.bodyA;
        }
    });
    for (let step = 0; step < 600 && !hit; step++) {
        Matter.Engine.update(engine, 1000 / 120);
        if (step % 2 === 0 && (scene.windTick + (step >> 1) + 1) % 4 === 0) applyWindForce([ball], scene.wind, 4);
    }
    Matter.Engine.clear(engine);
    return { closest, distance, hitLabel: hit?.label, hitBodyId: hit?.id };
}

afterEach(() => vi.useRealTimers());

describe('Training Bot ballistics and feedback', () => {
    it('feeds real session impacts back once per shot and changes the next launch', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
        const random = vi.spyOn(Math, 'random').mockReturnValue(0.25);
        const observations = vi.spyOn(BotAI.prototype, 'observeShot');
        const emit = vi.fn();
        const session = new GameSession({ to: () => ({ emit }) } as unknown as Server, 'bot-feedback', [
            { socketId: 'bot-training', side: 'left', ready: true, name: 'Bot' },
            { socketId: 'human', side: 'right', ready: true, name: 'Player' },
        ], 42);
        try {
            session.setHazards([]);
            const fire = vi.spyOn(session, 'fireProjectile');
            session.getStateMachine().startCombatPhase();
            vi.advanceTimersByTime(BOT_FIRE_DELAY_MS + 5100);
            expect(fire).toHaveBeenCalledTimes(1);
            expect(observations).toHaveBeenCalledTimes(1);
            expect(observations.mock.calls[0][0].projectileId).toBe(fire.mock.results[0].value);
            const closest = observations.mock.calls[0][0].closest;
            expect(Number.isFinite(closest.x) && Number.isFinite(closest.y)).toBe(true);
            session.getStateMachine().startTurn('left');
            vi.advanceTimersByTime(BOT_FIRE_DELAY_MS + 5100);
            expect(fire).toHaveBeenCalledTimes(2);
            expect(observations).toHaveBeenCalledTimes(2);
            expect(fire.mock.calls[1].slice(1)).not.toEqual(fire.mock.calls[0].slice(1));
        } finally {
            session.destroy();
            random.mockRestore();
            observations.mockRestore();
        }
    });

    it.each(['left', 'right'] as Side[])('solves from the actual %s cannon with wind and ceiling', side => {
        const scene = sceneFor(side);
        const positions = scene.bodies.map(body => ({ ...body.position }));
        const plan = findBotShot(scene, 0);
        expect(scene.bodies.map(body => body.position)).toEqual(positions);
        const actual = observeLiveShot(scene, plan.angle, plan.power);
        expect(actual.hitBodyId).toBe(scene.targetBodyId);
        expect(actual.distance).toBeLessThan(22);
        expect(plan.power).toBeGreaterThan(40);
        expect(plan.power).toBeLessThanOrEqual(100);
    });

    it.each(['left', 'right'] as Side[])('learns from actual %s impacts, then retargets a moving king and changed wind', side => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        let targetX = 1750, wind = 1, id = 0;
        let currentScene = sceneFor(side, targetX, wind);
        const fired: { id: number; angle: number; power: number }[] = [];
        const bot = new BotAI(side, {
            random: seededRandom(1729), getKingPosition: () => ({ x: 600, y: 480 }),
            getFoundationTopY: () => 500, getBallisticsScene: () => currentScene,
            canBuild: () => true, canFire: () => true, spawnBlock: vi.fn(),
            fireProjectile: (_side, angle, power) => {
                fired.push({ id: ++id, angle, power }); return id;
            },
        });
        const misses: number[] = [];
        const times: number[] = [];
        for (let turn = 0; turn < 8; turn++) {
            if (turn === 3) { targetX = 1550; wind = -1; }
            currentScene = sceneFor(side, targetX, wind);
            bot.takeTurn();
            const start = performance.now();
            vi.advanceTimersByTime(BOT_FIRE_DELAY_MS);
            times.push(performance.now() - start);
            const shot = fired[turn];
            const actual = observeLiveShot(currentScene, shot.angle, shot.power);
            bot.observeShot({ projectileId: shot.id, ...actual });
            misses.push(actual.distance);
        }
        expect(misses[0]).toBeGreaterThan(25);
        expect(Math.min(...misses.slice(1, 3))).toBeLessThan(misses[0] * 0.8);
        expect(Math.max(...misses.slice(-3))).toBeLessThan(23);
        expect(Math.abs(fired[3].power - fired[2].power) + Math.abs(fired[3].angle - fired[2].angle)).toBeGreaterThan(0.05);
        expect(times.reduce((sum, time) => sum + time, 0) / times.length).toBeLessThan(100);
        bot.destroy();
    });

    it('reevaluates live blocking geometry without changing it', () => {
        const clear = sceneFor('left', 1000);
        const clearPlan = findBotShot(clear, 0);
        const blocked = sceneFor('left', 1000);
        blocked.bodies.push(Matter.Bodies.rectangle(780, 450, 40, 180, { label: 'stone', isStatic: true }));
        const blockedPlan = findBotShot(blocked, 0);
        const actual = observeLiveShot(blocked, blockedPlan.angle, blockedPlan.power);
        expect(blockedPlan.angle).not.toBe(clearPlan.angle);
        expect(actual.hitBodyId).toBe(blocked.targetBodyId);
    });

    it('ignores unknown/duplicate observations and cancels pending work on destroy or lost turn', () => {
        vi.useFakeTimers();
        let canFire = true;
        const fire = vi.fn(() => 7), spawn = vi.fn();
        const deps: BotAIDeps = {
            random: seededRandom(42), getKingPosition: () => ({ x: 600, y: 480 }), getFoundationTopY: () => 500,
            getBallisticsScene: () => sceneFor('left'), canBuild: () => true, canFire: () => canFire,
            fireProjectile: fire, spawnBlock: spawn,
        };
        const bot = new BotAI('left', deps);
        bot.takeTurn();
        canFire = false;
        vi.advanceTimersByTime(BOT_FIRE_DELAY_MS);
        expect(fire).not.toHaveBeenCalled();
        canFire = true;
        bot.takeTurn(); bot.takeTurn();
        vi.advanceTimersByTime(BOT_FIRE_DELAY_MS);
        expect(fire).toHaveBeenCalledTimes(1);
        bot.observeShot({ projectileId: 99, closest: { x: 1900, y: 480 } });
        bot.observeShot({ projectileId: 7, closest: { x: NaN, y: 480 } });
        bot.buildFortress(); bot.takeTurn(); bot.destroy();
        vi.advanceTimersByTime(BOT_BUILD_DELAY_MS + BOT_FIRE_DELAY_MS);
        expect(fire).toHaveBeenCalledTimes(1);
        expect(spawn).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('learns only from matching real feedback, ignores duplicates, and resets for a new round', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const scene = sceneFor('left');
        const makeBot = () => {
            let id = 0;
            const fire = vi.fn((_side: Side, angle: number, power: number) => ({ id: ++id, angle, power }));
            const bot = new BotAI('left', {
                random: () => 0.25, getKingPosition: () => ({ x: 600, y: 480 }), getFoundationTopY: () => 500,
                getBallisticsScene: () => scene, canFire: () => true, canBuild: () => true, spawnBlock: vi.fn(),
                fireProjectile: (side, angle, power) => fire(side, angle, power).id,
            });
            const shoot = () => {
                bot.takeTurn(); vi.advanceTimersByTime(BOT_FIRE_DELAY_MS);
                return fire.mock.results[fire.mock.results.length - 1].value;
            };
            return { bot, shoot };
        };
        const a = makeBot(), b = makeBot();
        const first = a.shoot();
        expect(a.shoot().power).toBe(first.power);
        const matching = a.shoot();
        b.shoot(); b.shoot(); b.shoot();
        const feedback = { projectileId: matching.id, closest: { x: scene.target.x - 80, y: 480 } };
        a.bot.observeShot({ ...feedback, projectileId: 99 });
        a.bot.observeShot(feedback); b.bot.observeShot(feedback);
        a.bot.observeShot({ ...feedback, closest: { x: -1000, y: 480 } });
        const nextA = a.shoot(), nextB = b.shoot();
        expect(nextA.power).toBe(nextB.power);
        expect(nextA.angle).toBe(nextB.angle);
        expect(Math.abs(nextA.power - first.power) + Math.abs(nextA.angle - first.angle)).toBeGreaterThan(0.05);
        a.bot.resetRound();
        const reset = a.shoot();
        expect(reset.power).toBe(first.power);
        expect(reset.angle).toBe(first.angle);
        a.bot.destroy(); b.bot.destroy();
    });
});
