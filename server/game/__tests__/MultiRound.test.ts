import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Server } from 'socket.io';
import { RoomManager } from '../RoomManager';
import { ROUNDS_TO_WIN } from '../../config/constants';

// Suppress console.log during tests
vi.spyOn(console, 'log').mockImplementation(() => {});

function createMockIo(): Server {
    const emitFn = vi.fn();
    const toFn = vi.fn(() => ({ emit: emitFn }));
    return {
        to: toFn,
        emit: emitFn,
        sockets: { sockets: new Map() },
    } as unknown as Server;
}

describe('Multi-round match flow (best-of-3)', () => {
    let io: Server;
    let rm: RoomManager;
    let emitFn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        io = createMockIo();
        rm = new RoomManager(io);
        emitFn = (io.to as any)().emit;
    });

    afterEach(() => {
        rm.destroy();
        vi.useRealTimers();
    });

    function setupMatch() {
        const room = rm.createRoom('socket-1', 'Alice');
        rm.joinRoom(room.id, 'socket-2', 'Bob');
        rm.setPlayerReady('socket-1');
        rm.setPlayerReady('socket-2');
        rm.startMatch(room.id);
        return room;
    }

    it('tracks round score correctly after round 1', () => {
        const room = setupMatch();
        expect(room.roundScore).toEqual({ left: 0, right: 0 });
        expect(room.currentRound).toBe(1);
    });

    it('increments winner round score on round end', () => {
        const room = setupMatch();
        const session = room.session!;

        // Simulate left king death by setting HP to 0 and letting combat resolve
        // We'll trigger via the state machine's combat phase
        session.getStateMachine().startBuildPhase();
        vi.advanceTimersByTime(90_000); // build ends → reveal
        vi.advanceTimersByTime(5_000);  // reveal ends → combat

        // Kill left king by manipulating state directly
        const kingsHp = session.getKingsHp();

        // Access internal state through the public API
        const leftPlayer = session.getPlayerState('socket-1');
        if (leftPlayer) {
            leftPlayer.kingState.hp = 0;
        }

        // Let combat turn expire to trigger win check
        vi.advanceTimersByTime(15_000);

        // Right should have won this round
        expect(room.roundScore.right).toBe(1);
    });

    it('round_result event includes round score and isFinalRound flag', () => {
        const room = setupMatch();
        const session = room.session!;

        session.getStateMachine().startBuildPhase();
        vi.advanceTimersByTime(90_000 + 5_000); // build → reveal → combat

        // Kill left king
        const leftPlayer = session.getPlayerState('socket-1');
        if (leftPlayer) leftPlayer.kingState.hp = 0;
        vi.advanceTimersByTime(15_000);

        const roundResultCalls = emitFn.mock.calls.filter(
            (c: any[]) => c[0] === 'round_result'
        );
        expect(roundResultCalls.length).toBeGreaterThanOrEqual(1);

        const lastRoundResult = roundResultCalls[roundResultCalls.length - 1][1];
        expect(lastRoundResult).toHaveProperty('winner');
        expect(lastRoundResult).toHaveProperty('roundScore');
        expect(lastRoundResult).toHaveProperty('isFinalRound');
    });

    it('match ends when a player wins ROUNDS_TO_WIN rounds', () => {
        const room = setupMatch();

        // Simulate enough round wins for a match victory
        // Directly manipulate roundScore to simulate prior wins
        room.roundScore.right = ROUNDS_TO_WIN - 1;

        const session = room.session!;
        session.getStateMachine().startBuildPhase();
        vi.advanceTimersByTime(90_000 + 5_000);

        const leftPlayer = session.getPlayerState('socket-1');
        if (leftPlayer) leftPlayer.kingState.hp = 0;
        vi.advanceTimersByTime(15_000);

        // The round result should be marked as final
        const roundResultCalls = emitFn.mock.calls.filter(
            (c: any[]) => c[0] === 'round_result'
        );
        const lastResult = roundResultCalls[roundResultCalls.length - 1][1];
        expect(lastResult.isFinalRound).toBe(true);
    });

    it('match scores are emitted when match is truly over', () => {
        const room = setupMatch();
        room.roundScore.right = ROUNDS_TO_WIN - 1;

        const session = room.session!;
        session.getStateMachine().startBuildPhase();
        vi.advanceTimersByTime(90_000 + 5_000);

        const leftPlayer = session.getPlayerState('socket-1');
        if (leftPlayer) leftPlayer.kingState.hp = 0;
        vi.advanceTimersByTime(15_000);

        const scoresCalls = emitFn.mock.calls.filter(
            (c: any[]) => c[0] === 'match_scores'
        );
        expect(scoresCalls.length).toBeGreaterThanOrEqual(1);

        const scores = scoresCalls[0][1];
        expect(scores).toHaveProperty('left');
        expect(scores).toHaveProperty('right');
        expect(scores.right.winBonus).toBeGreaterThan(0);
        expect(scores.left.winBonus).toBe(0);
    });

    it('rematch resets round score and round counter', () => {
        const room = setupMatch();
        room.roundScore = { left: 2, right: 1 };
        room.currentRound = 3;
        room.phase = 'result';

        rm.requestRematch('socket-1');
        rm.requestRematch('socket-2');

        expect(room.roundScore).toEqual({ left: 0, right: 0 });
        expect(room.currentRound).toBe(1);
    });

    it('rematch creates a fresh GameSession', () => {
        const room = setupMatch();
        const oldSession = room.session;
        room.phase = 'result';

        rm.requestRematch('socket-1');
        rm.requestRematch('socket-2');

        expect(room.session).not.toBe(oldSession);
        expect(room.phase).toBe('build');
    });

    it('rematch resets king HP to full', () => {
        const room = setupMatch();
        room.phase = 'result';

        rm.requestRematch('socket-1');
        rm.requestRematch('socket-2');

        const kingsHp = room.session!.getKingsHp();
        expect(kingsHp.left.hp).toBe(kingsHp.left.maxHp);
        expect(kingsHp.right.hp).toBe(kingsHp.right.maxHp);
    });
});
