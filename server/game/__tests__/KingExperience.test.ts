import { afterEach, describe, expect, it, vi } from 'vitest';
import Matter from 'matter-js';
import type { Server } from 'socket.io';
import { GameSession } from '../GameSession';
import { KING_HEIGHT, KING_WIDTH, BOT_BUILD_DELAY_MS } from '../../config/constants';

const sessions: GameSession[] = [];
function fixture(bot = false) {
    vi.useFakeTimers();
    const emit = vi.fn(), roundEnd = vi.fn(() => 'match_over' as const);
    const session = new GameSession({ to: () => ({ emit }) } as unknown as Server, 'king-experience', [
        { socketId: 'left', side: 'left', ready: true, name: 'Left' },
        { socketId: bot ? 'bot-right' : 'right', side: 'right', ready: true, name: 'Right' },
    ], 42, undefined, roundEnd);
    sessions.push(session); session.setHazards([]);
    session.getStateMachine().startBuildPhase();
    return { session, emit, roundEnd, engine: (session as unknown as { engine: Matter.Engine }).engine };
}
afterEach(() => { for (const session of sessions.splice(0)) session.destroy(); vi.useRealTimers(); });

describe('king placement, survivability and defeat', () => {
    it('places both authoritative cannons in front of and close to their own kings', () => {
        const { session } = fixture();
        const cannons = session.getTerrainData().cannons;
        for (const side of ['left', 'right'] as const) {
            const player = session.getPlayerBySide(side)!;
            expect(player.cannonX - player.kingBody.position.x).toBe(side === 'left' ? 160 : -160);
            expect(cannons[side]?.x).toBe(player.cannonX);
            expect(cannons[side]?.y).toBeLessThan(600);
        }
    });
    it('uses an upright character body and safe construction support that releases in combat', () => {
        const { session } = fixture();
        const king = session.getPlayerBySide('left')!.kingBody;
        expect(king.circleRadius).toBe(0);
        expect(king.bounds.max.x - king.bounds.min.x).toBeCloseTo(KING_WIDTH, 0);
        expect(king.bounds.max.y - king.bounds.min.y).toBeCloseTo(KING_HEIGHT, 0);
        expect(king.inertia).toBe(Infinity);
        const x = king.position.x;
        Matter.Body.setVelocity(king, { x: 8, y: 0 });
        vi.advanceTimersByTime(1000);
        expect(Math.abs(king.position.x - x)).toBeLessThan(1);
        expect(Matter.Composite.allConstraints(session.getWorld())).toHaveLength(2);
        session.getStateMachine().startCombatPhase();
        expect(Matter.Composite.allConstraints(session.getWorld())).toHaveLength(0);
        Matter.Body.setVelocity(king, { x: 6, y: -5 });
        vi.advanceTimersByTime(200);
        expect(Math.abs(king.position.x - x)).toBeGreaterThan(5);
        expect(king.isStatic).toBe(false);
        expect(king.angle).toBe(0);
    });
    it('does not spawn a manually placed block through the crowned character', () => {
        const { session } = fixture();
        const king = session.getPlayerBySide('left')!.kingBody;
        session.handleSpawn('left', { x: king.position.x, y: king.position.y, material: 'stone' });
        const block = Matter.Composite.allBodies(session.getWorld()).find(body => body.label === 'stone')!;
        expect(block.bounds.max.y).toBeLessThan(king.position.y + KING_HEIGHT / 2 - 84);
        vi.advanceTimersByTime(2000);
        expect(session.getKingsHp().left.hp).toBe(100);
    });
    it('extends each foundation into the lowest ground under its footprint instead of floating on a slope', () => {
        for (const seed of [42, 81, 1024, 5381]) {
            const emit = vi.fn();
            const session = new GameSession({ to: () => ({ emit }) } as unknown as Server, 'slope', [
                { socketId: 'left', side: 'left', ready: true, name: 'Left' },
                { socketId: 'right', side: 'right', ready: true, name: 'Right' },
            ], seed);
            sessions.push(session);
            for (const body of Matter.Composite.allBodies(session.getWorld()).filter(body => body.label === 'foundation')) {
                for (const point of session.getTerrainData().points.filter(point => point.x >= body.bounds.min.x && point.x <= body.bounds.max.x)) {
                    expect(body.bounds.max.y).toBeGreaterThan(point.y + 5);
                }
            }
        }
    });
    it('builds bot walls on the actual platform and leaves room above the crown', () => {
        const { session } = fixture(true);
        vi.advanceTimersByTime(BOT_BUILD_DELAY_MS);
        const king = session.getPlayerBySide('right')!.kingBody;
        const foundation = Matter.Composite.allBodies(session.getWorld()).find(body => body.label === 'foundation' && body.position.x > 1200)!;
        const blocks = Matter.Composite.allBodies(session.getWorld()).filter(body => ['wood', 'stone', 'steel'].includes(body.label));
        expect(blocks).toHaveLength(10);
        const walls = blocks.filter(body => ['stone', 'wood'].includes(body.label) && body.bounds.max.y - body.bounds.min.y > 80);
        expect(walls).toHaveLength(4);
        for (const wall of walls) expect(wall.bounds.max.y).toBeCloseTo(foundation.bounds.min.y, 0);
        const roof = blocks.filter(body => body.bounds.min.x < king.position.x && body.bounds.max.x > king.position.x);
        for (const block of roof) expect(block.bounds.max.y).toBeLessThan(king.position.y + KING_HEIGHT / 2 - 84);
    });
    it('lands upright after knockback without healing, teleporting home or becoming a rolling dummy', () => {
        const { session } = fixture();
        session.getStateMachine().startCombatPhase();
        const player = session.getPlayerBySide('left')!, king = player.kingBody;
        player.kingState.hp = 90;
        Matter.Body.setPosition(king, { x: 900, y: 350 });
        Matter.Body.setVelocity(king, { x: 6, y: 4 });
        Matter.Body.setAngle(king, 1.2); Matter.Body.setAngularVelocity(king, 0.2);
        vi.advanceTimersByTime(3000);
        expect(king.angle).toBe(0); expect(king.angularVelocity).toBe(0);
        expect(king.position.x).toBeGreaterThan(850);
        expect(player.kingState.hp).toBeGreaterThan(0); expect(player.kingState.hp).toBeLessThanOrEqual(90);
        expect(Math.abs(king.velocity.y)).toBeLessThan(1);
    });
    it('broadcasts live king coordinates from the completed physics step, even without a hit', () => {
        const { session, emit } = fixture();
        session.getStateMachine().startCombatPhase();
        const king = session.getPlayerBySide('left')!.kingBody;
        const origin = king.position.x;
        Matter.Body.setVelocity(king, { x: 5, y: -5 });
        vi.advanceTimersByTime(250);
        const packets = emit.mock.calls.filter(call => call[0] === 'gameState').map(call => call[1]);
        const last = packets[packets.length - 1];
        const update = last.u.find((tuple: number[]) => tuple[0] === king.id);
        expect(last.k.l.x).toBeGreaterThan(origin + 5);
        expect(update[1]).toBeCloseTo(last.k.l.x, 0); expect(update[2]).toBeCloseTo(last.k.l.y, 0);
    });
    it('two solid shots defeat a full-health king and resolve promptly, without waiting for debris', () => {
        const { session, engine, roundEnd, emit } = fixture();
        session.getStateMachine().startCombatPhase();
        Matter.Composite.clear(session.getWorld(), false); engine.gravity.scale = 0;
        const player = session.getPlayerBySide('right')!, king = player.kingBody;
        Matter.Composite.add(session.getWorld(), king);
        const hit = () => {
            Matter.Body.setPosition(king, { x: 900, y: 250 }); Matter.Body.setVelocity(king, { x: 0, y: 0 });
            const id = session.fireProjectile('left', Math.PI / 4, 50)!;
            const ball = Matter.Composite.allBodies(session.getWorld()).find(body => body.id === id)!;
            Matter.Body.setPosition(ball, { x: 866, y: 250 }); Matter.Body.setVelocity(ball, { x: 32, y: 0 });
            vi.advanceTimersByTime(100); Matter.Composite.remove(session.getWorld(), ball);
        };
        hit(); expect(player.kingState.hp).toBeGreaterThan(0); expect(player.kingState.hp).toBeLessThanOrEqual(50);
        expect(roundEnd).not.toHaveBeenCalled();
        session.getStateMachine().startTurn('left'); hit();
        expect(player.kingState.hp).toBe(0); expect(roundEnd).toHaveBeenCalledExactlyOnceWith('left', 'king_destroyed');
        const defeatedX = king.position.x;
        vi.advanceTimersByTime(6000); expect(roundEnd).toHaveBeenCalledTimes(1);
        expect(king.position.x).toBe(defeatedX);
        expect(emit.mock.calls.filter(call => call[0] === 'king_dead')).toHaveLength(1);
        const snapshots = emit.mock.calls.filter(call => call[0] === 'gameState');
        expect(snapshots[snapshots.length - 1]?.[1].k.r.hp).toBe(0);
        expect(session.computeMatchScores('left').left.damageDealt).toBeCloseTo(100);
    });
    it('an out-of-world king is defeated instead of leaving an unwinnable round running', () => {
        const { session, roundEnd } = fixture(); session.getStateMachine().startCombatPhase();
        Matter.Body.setPosition(session.getPlayerBySide('right')!.kingBody, { x: 1800, y: 800 });
        vi.advanceTimersByTime(20);
        expect(session.getKingsHp().right.hp).toBe(0);
        expect(roundEnd).toHaveBeenCalledExactlyOnceWith('left', 'king_destroyed');
    });
});
