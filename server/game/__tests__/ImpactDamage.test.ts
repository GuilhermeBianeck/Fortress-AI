import { afterEach, describe, expect, it, vi } from 'vitest';
import Matter from 'matter-js';
import type { Server } from 'socket.io';
import { GameSession } from '../GameSession';
import { incomingVelocity, kingImpactDamage, projectileBlockDamage } from '../impactDamage';
import {
    MATERIAL_PROPS, MATERIAL_BLOCK_HP, PROJECTILE_BLOCK_DAMAGE_MULT,
    PROJECTILE_DENSITY, PROJECTILE_RADIUS, PROJECTILE_MAX_KING_DAMAGE,
} from '../../config/constants';

type Block = Matter.Body & { blockHp: number; blockMaxHp: number };
const sessions: GameSession[] = [];

function fixture() {
    vi.useFakeTimers();
    const emit = vi.fn();
    const io = { to: () => ({ emit }), emit } as unknown as Server;
    const session = new GameSession(io, 'damage-qa', [
        { socketId: 'left', side: 'left', ready: true, name: 'Left' },
        { socketId: 'right', side: 'right', ready: true, name: 'Right' },
    ], 42);
    sessions.push(session);
    session.setHazards([]);
    const engine = (session as unknown as { engine: Matter.Engine }).engine;
    engine.gravity.scale = 0;
    Matter.Composite.clear(engine.world, false);
    const target = session.getPlayerBySide('right')!;
    Matter.Body.setPosition(target.kingBody, { x: 900, y: 250 });
    Matter.Body.setVelocity(target.kingBody, { x: 0, y: 0 });
    Matter.Composite.add(engine.world, target.kingBody);
    session.getStateMachine().startCombatPhase();
    return { session, engine, emit, target };
}

function fireAt(session: GameSession, x: number, y: number, vx: number, vy = 0) {
    const id = session.fireProjectile('left', Math.PI / 4, 50)!;
    const ball = Matter.Composite.allBodies(session.getWorld()).find(body => body.id === id)!;
    Matter.Body.setPosition(ball, { x, y });
    Matter.Body.setVelocity(ball, { x: vx, y: vy });
    return ball;
}

afterEach(() => {
    for (const session of sessions.splice(0)) session.destroy();
    vi.useRealTimers();
});

describe('Authoritative impact balance', () => {
    it('normalizes incoming half-step velocities before collision resolution', () => {
        const engine = Matter.Engine.create();
        engine.gravity.scale = 0;
        const ball = Matter.Bodies.circle(0, 0, 9, { frictionAir: 0 });
        Matter.Composite.add(engine.world, ball);
        Matter.Body.setVelocity(ball, { x: 36, y: -12 });
        Matter.Events.on(engine, 'beforeSolve', () => {
            expect(incomingVelocity(ball).x).toBeCloseTo(36);
            expect(incomingVelocity(ball).y).toBeCloseTo(-12);
        });
        Matter.Engine.update(engine, 1000 / 120);
    });

    it('deals a decisive 50-75 HP direct king hit at typical incoming speed', () => {
        const { session, engine, target, emit } = fixture();
        fireAt(session, 866, 250, 32);
        for (let i = 0; i < 6; i++) Matter.Engine.update(engine, 1000 / 120);
        const damage = 100 - target.kingState.hp;
        expect(damage).toBeGreaterThanOrEqual(50);
        expect(damage).toBeLessThanOrEqual(75);
        const damageEvents = emit.mock.calls.filter(call => call[0] === 'king_damage');
        expect(damageEvents).toHaveLength(1);
        expect(damageEvents[0][1].damage).toBeCloseTo(damage);
        expect(session.computeMatchScores('left').left.damageDealt).toBeCloseTo(damage, 0);
    });

    it('caps a fast direct hit, and records only remaining HP when scoring a kill', () => {
        const { session, engine, target, emit } = fixture();
        target.kingState.hp = 8;
        fireAt(session, 860, 250, 90);
        Matter.Engine.update(engine, 1000 / 120);
        expect(target.kingState.hp).toBe(0);
        const event = emit.mock.calls.find(call => call[0] === 'king_damage')!;
        expect(event[1].damage).toBe(8);
        expect(session.computeMatchScores('left').left.damageDealt).toBe(8);
        const king = Matter.Bodies.circle(0, 0, 12, { density: 0.003 });
        const projectile = Matter.Bodies.circle(0, 0, 9, { density: PROJECTILE_DENSITY, label: 'projectile' });
        expect(kingImpactDamage(king, projectile, 100)).toBe(PROJECTILE_MAX_KING_DAMAGE);
    });

    it.each(['wood', 'stone', 'steel'])('keeps %s durability distinct under the stronger block impact', material => {
        const { session, engine, target } = fixture();
        Matter.Composite.remove(engine.world, target.kingBody);
        const block = Matter.Bodies.rectangle(900, 250, 30, 30, { ...MATERIAL_PROPS[material], label: material }) as Block;
        block.blockHp = block.blockMaxHp = MATERIAL_BLOCK_HP[material];
        Matter.Composite.add(engine.world, block);
        fireAt(session, 866, 250, 32);
        for (let i = 0; i < 6; i++) Matter.Engine.update(engine, 1000 / 120);
        if (material === 'steel') expect(block.blockHp).toBe(110);
        else expect(block.blockHp).toBe(0);
        expect(PROJECTILE_BLOCK_DAMAGE_MULT).toBe(3);
    });

    it('raises moderate block damage 50 percent while rejecting glancing/tiny impacts', () => {
        const ball = Matter.Bodies.circle(0, 0, PROJECTILE_RADIUS, { density: PROJECTILE_DENSITY });
        const wood = Matter.Bodies.rectangle(0, 0, 30, 30, { density: MATERIAL_PROPS.wood.density });
        const speed = 3.1;
        const oldDamage = speed * ball.mass * wood.mass / (ball.mass + wood.mass) * 2;
        expect(projectileBlockDamage(ball, wood, speed)).toBeCloseTo(oldDamage * 1.5);
        expect(projectileBlockDamage(ball, wood, 0.5)).toBe(0);
        expect(kingImpactDamage(Matter.Bodies.circle(0, 0, 12, { density: 0.003 }), ball, 0.5)).toBe(0);
    });

    it('does not turn a largely tangential contact into a direct hit', () => {
        const { session, engine, target } = fixture();
        // Almost vertically skims the king's left edge: mostly tangent, not normal speed.
        fireAt(session, 877, 210, 0, 35);
        for (let i = 0; i < 4; i++) Matter.Engine.update(engine, 1000 / 120);
        expect(100 - target.kingState.hp).toBeLessThan(15);
    });

    it('does not apply duplicate pair events or later bounces twice to the same king', () => {
        const { session, engine, target } = fixture();
        const ball = fireAt(session, 866, 250, 32);
        let collision: Matter.IEventCollision<Matter.Engine> | undefined;
        Matter.Events.on(engine, 'collisionStart', event => { collision = event; });
        Matter.Engine.update(engine, 1000 / 120);
        expect(collision).toBeDefined();
        const hp = target.kingState.hp;
        Matter.Events.trigger(engine, 'collisionStart', { pairs: [...collision!.pairs, ...collision!.pairs] });
        Matter.Body.setPosition(ball, { x: target.kingBody.position.x - 34, y: target.kingBody.position.y });
        Matter.Body.setVelocity(ball, { x: 40, y: 0 });
        for (let i = 0; i < 8; i++) Matter.Engine.update(engine, 1000 / 120);
        expect(target.kingState.hp).toBe(hp);
    });

    it('resting kings do not accumulate terrain jitter damage', () => {
        const { engine, target } = fixture();
        engine.gravity.scale = 0.001;
        const floor = Matter.Bodies.rectangle(900, 302, 200, 40, { isStatic: true, label: 'foundation' });
        Matter.Composite.add(engine.world, floor);
        for (let i = 0; i < 720; i++) Matter.Engine.update(engine, 1000 / 120);
        expect(target.kingState.hp).toBe(100);
    });

    it('enforces turn ownership for internal bot fire too, including forfeit', () => {
        const { session } = fixture();
        expect(session.fireProjectile('right', Math.PI / 4, 50)).toBeUndefined();
        session.handleForfeit();
        expect(session.fireProjectile('left', Math.PI / 4, 50)).toBeUndefined();
    });
});
