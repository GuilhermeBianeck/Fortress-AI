import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Matter from 'matter-js';
import { Server } from 'socket.io';
import { GameSession } from '../GameSession';
import type { PlayerInfo, Side } from '../../types';
import {
    KING_MAX_HP,
    LEFT_SIDE,
    RIGHT_SIDE,
    CANVAS_HEIGHT,
    MATERIAL_BLOCK_HP,
} from '../../config/constants';

// Suppress console.log during tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

function createMockIo(): Server {
    const emitFn = vi.fn();
    const toFn = vi.fn(() => ({ emit: emitFn }));
    return {
        to: toFn,
        emit: emitFn,
        sockets: { sockets: new Map() },
    } as unknown as Server;
}

function createSession(io?: Server, seed?: number): GameSession {
    const mockIo = io ?? createMockIo();
    const players: PlayerInfo[] = [
        { socketId: 'player-left', side: 'left', ready: true, name: 'P1' },
        { socketId: 'player-right', side: 'right', ready: true, name: 'P2' },
    ];
    return new GameSession(mockIo, 'test-room', players, seed ?? 42);
}

describe('GameSession', () => {
    let session: GameSession;
    let io: Server;

    beforeEach(() => {
        io = createMockIo();
        session = createSession(io, 42);
    });

    afterEach(() => {
        session.destroy();
    });

    describe('initialization', () => {
        it('creates kings for both sides with full HP', () => {
            const kingsHp = session.getKingsHp();
            expect(kingsHp.left.hp).toBe(KING_MAX_HP);
            expect(kingsHp.left.maxHp).toBe(KING_MAX_HP);
            expect(kingsHp.right.hp).toBe(KING_MAX_HP);
            expect(kingsHp.right.maxHp).toBe(KING_MAX_HP);
        });

        it('places left king on the left side of the map', () => {
            const kingsHp = session.getKingsHp();
            expect(kingsHp.left.x).toBeGreaterThanOrEqual(LEFT_SIDE.min);
            expect(kingsHp.left.x).toBeLessThanOrEqual(LEFT_SIDE.max);
        });

        it('places right king on the right side of the map', () => {
            const kingsHp = session.getKingsHp();
            expect(kingsHp.right.x).toBeGreaterThanOrEqual(RIGHT_SIDE.min);
            expect(kingsHp.right.x).toBeLessThanOrEqual(RIGHT_SIDE.max);
        });

        it('initializes player states for both sockets', () => {
            expect(session.getPlayerState('player-left')).toBeDefined();
            expect(session.getPlayerState('player-right')).toBeDefined();
            expect(session.getPlayerState('nonexistent')).toBeUndefined();
        });

        it('assigns correct build zones per side', () => {
            const leftPlayer = session.getPlayerState('player-left')!;
            const rightPlayer = session.getPlayerState('player-right')!;

            expect(leftPlayer.buildZone.xMin).toBe(LEFT_SIDE.min);
            expect(leftPlayer.buildZone.xMax).toBe(LEFT_SIDE.max);
            expect(rightPlayer.buildZone.xMin).toBe(RIGHT_SIDE.min);
            expect(rightPlayer.buildZone.xMax).toBe(RIGHT_SIDE.max);
        });

        it('terrain data includes points, build zones, and hazards', () => {
            const terrain = session.getTerrainData();
            expect(terrain.points.length).toBeGreaterThan(0);
            expect(Array.isArray(terrain.buildZones)).toBe(true);
            expect(Array.isArray(terrain.hazards)).toBe(true);
            expect(terrain.seed).toBe(42);
        });
    });

    describe('handleSpawn — build zone enforcement', () => {
        beforeEach(() => {
            // Put session into build phase so spawns are accepted
            session.getStateMachine().startBuildPhase();
        });

        it('rejects spawn outside player build zone', () => {
            const worldBefore = Matter.Composite.allBodies(session.getWorld()).length;

            // Left player tries to spawn on the right side
            session.handleSpawn('player-left', {
                x: RIGHT_SIDE.min + 100,
                y: 400,
                material: 'wood',
                shape: 'rectangle',
            });

            const worldAfter = Matter.Composite.allBodies(session.getWorld()).length;
            expect(worldAfter).toBe(worldBefore);
        });

        it('accepts spawn inside player build zone', () => {
            const worldBefore = Matter.Composite.allBodies(session.getWorld()).length;
            const leftPlayer = session.getPlayerState('player-left')!;

            session.handleSpawn('player-left', {
                x: (leftPlayer.buildZone.xMin + leftPlayer.buildZone.xMax) / 2,
                y: 400,
                material: 'wood',
                shape: 'rectangle',
            });

            const worldAfter = Matter.Composite.allBodies(session.getWorld()).length;
            expect(worldAfter).toBe(worldBefore + 1);
        });

        it('rejects spawn during combat phase', () => {
            session.getStateMachine().startCombatPhase();
            const worldBefore = Matter.Composite.allBodies(session.getWorld()).length;

            session.handleSpawn('player-left', {
                x: 200,
                y: 400,
                material: 'wood',
                shape: 'rectangle',
            });

            expect(Matter.Composite.allBodies(session.getWorld()).length).toBe(worldBefore);
        });

        it('rejects spawn with non-finite coordinates', () => {
            const worldBefore = Matter.Composite.allBodies(session.getWorld()).length;

            session.handleSpawn('player-left', { x: NaN, y: 400 });
            session.handleSpawn('player-left', { x: 200, y: Infinity });

            expect(Matter.Composite.allBodies(session.getWorld()).length).toBe(worldBefore);
        });

        it('rejects spawn from unknown socket', () => {
            const worldBefore = Matter.Composite.allBodies(session.getWorld()).length;
            session.handleSpawn('unknown-socket', { x: 200, y: 400 });
            expect(Matter.Composite.allBodies(session.getWorld()).length).toBe(worldBefore);
        });
    });

    describe('handleFireProjectile — turn enforcement', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            session.getStateMachine().startCombatPhase();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('allows current turn player to fire', () => {
            const currentTurn = session.getStateMachine().getCurrentTurn();
            const socketId = currentTurn === 'left' ? 'player-left' : 'player-right';
            const worldBefore = Matter.Composite.allBodies(session.getWorld()).length;

            session.handleFireProjectile(socketId, { angle: Math.PI / 4, power: 50 });

            // A projectile body should have been added
            expect(Matter.Composite.allBodies(session.getWorld()).length).toBe(worldBefore + 1);
        });

        it('rejects fire from wrong turn player', () => {
            const currentTurn = session.getStateMachine().getCurrentTurn();
            const wrongSocket = currentTurn === 'left' ? 'player-right' : 'player-left';
            const worldBefore = Matter.Composite.allBodies(session.getWorld()).length;

            session.handleFireProjectile(wrongSocket, { angle: Math.PI / 4, power: 50 });

            expect(Matter.Composite.allBodies(session.getWorld()).length).toBe(worldBefore);
        });

        it('rejects non-numeric angle/power', () => {
            const worldBefore = Matter.Composite.allBodies(session.getWorld()).length;

            session.handleFireProjectile('player-left', { angle: 'bad', power: 50 });
            session.handleFireProjectile('player-left', { angle: Math.PI / 4, power: NaN });

            expect(Matter.Composite.allBodies(session.getWorld()).length).toBe(worldBefore);
        });

        it('prevents firing twice in the same turn', () => {
            const socketId = 'player-left'; // left goes first
            session.handleFireProjectile(socketId, { angle: Math.PI / 4, power: 50 });

            const afterFirst = Matter.Composite.allBodies(session.getWorld()).length;

            // Second fire attempt should be ignored
            session.handleFireProjectile(socketId, { angle: Math.PI / 3, power: 60 });

            expect(Matter.Composite.allBodies(session.getWorld()).length).toBe(afterFirst);
        });

        it('clamps angle and power to valid ranges', () => {
            // Fire with extreme values — should not crash
            session.handleFireProjectile('player-left', { angle: 0, power: 999 });

            // Projectile should still be created (values get clamped internally)
            const bodies = Matter.Composite.allBodies(session.getWorld());
            const projectile = bodies.find(b => b.label === 'projectile');
            expect(projectile).toBeDefined();
        });
    });

    describe('handleRequestBuild — phase gating', () => {
        it('rejects build requests outside build phase', async () => {
            const mockSocket = {
                id: 'player-left',
                emit: vi.fn(),
            } as any;

            // Session starts in lobby (no phase started)
            await session.handleRequestBuild(mockSocket, {
                apiKey: 'test-key',
                prompt: 'build a wall',
            });

            expect(mockSocket.emit).toHaveBeenCalledWith('build_error', {
                message: 'Building is only allowed during the build phase.',
            });
        });

        it('rejects build without a prompt', async () => {
            session.getStateMachine().startBuildPhase();
            const mockSocket = {
                id: 'player-left',
                emit: vi.fn(),
            } as any;

            await session.handleRequestBuild(mockSocket, {
                apiKey: 'test-key',
                prompt: '',
            });

            expect(mockSocket.emit).toHaveBeenCalledWith('build_error', {
                message: 'Missing prompt',
            });
        });
    });

    describe('forfeit handling', () => {
        it('stops state machine on forfeit', () => {
            vi.useFakeTimers();
            session.getStateMachine().startBuildPhase();
            session.handleForfeit();

            // Advancing time should not cause phase transitions
            const phaseAfterForfeit = session.getStateMachine().getPhase();
            vi.advanceTimersByTime(200_000);
            expect(session.getStateMachine().getPhase()).toBe(phaseAfterForfeit);
            vi.useRealTimers();
        });
    });
});
