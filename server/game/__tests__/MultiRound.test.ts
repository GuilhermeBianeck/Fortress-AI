import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Server } from 'socket.io';
import { RoomManager } from '../RoomManager';
import { ROUNDS_TO_WIN, COMBAT_TURN_DURATION_MS, ROUND_INTERSTITIAL_MS } from '../../config/constants';

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
        vi.advanceTimersByTime(COMBAT_TURN_DURATION_MS);

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
        vi.advanceTimersByTime(COMBAT_TURN_DURATION_MS);

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
        vi.advanceTimersByTime(COMBAT_TURN_DURATION_MS);

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
        vi.advanceTimersByTime(COMBAT_TURN_DURATION_MS);

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

    it('announces a non-interactive round break and sends the new round number to each player', () => {
        const room = setupMatch();
        const leftEmit = vi.fn();
        io.sockets.sockets.set('socket-1', { emit: leftEmit } as never);
        const session = room.session!;
        session.getStateMachine().startCombatPhase();
        session.getPlayerState('socket-1')!.kingState.hp = 0;
        session.getStateMachine().checkKingDefeat();
        expect(room.phase).toBe('intermission');
        expect(emitFn).toHaveBeenCalledWith('phase_change', expect.objectContaining({ phase: 'intermission', endsAt: expect.any(Number) }));
        expect(session.getStateMachine().canFire()).toBe(false);
        vi.advanceTimersByTime(ROUND_INTERSTITIAL_MS);
        expect(room.phase).toBe('build');
        expect(leftEmit).toHaveBeenCalledWith('match_started', expect.objectContaining({ currentRound: 2, roundScore: { left: 0, right: 1 } }));
    });

    it('cancels the pending next round when a player leaves during the break', () => {
        const room = setupMatch();
        const session = room.session!;
        session.getStateMachine().startCombatPhase();
        session.getPlayerState('socket-1')!.kingState.hp = 0;
        session.getStateMachine().checkKingDefeat();
        rm.handleDisconnect('socket-1');
        expect(room.phase).toBe('result');
        expect(vi.getTimerCount()).toBe(2);
        vi.advanceTimersByTime(ROUND_INTERSTITIAL_MS);
        expect(room.session).toBe(session);
        expect(room.phase).toBe('result');
    });

    it('rejects a rematch without an opponent', () => {
        const room = setupMatch();
        rm.handleDisconnect('socket-2');
        expect(room.phase).toBe('result');
        expect(rm.requestRematch('socket-1')).toBeNull();
        expect(room.rematchRequests.size).toBe(0);
    });

    it('reuses the vacant left side when the original host leaves the lobby', () => {
        const room = rm.createRoom('host', 'Host');
        rm.joinRoom(room.id, 'guest', 'Guest');
        rm.setPlayerReady('guest');
        rm.handleDisconnect('host');
        expect(room.players.get('guest')!.ready).toBe(false);
        rm.joinRoom(room.id, 'replacement', 'Replacement');
        expect(room.players.get('guest')!.side).toBe('right');
        expect(room.players.get('replacement')!.side).toBe('left');
    });

    it('reports all rounds in the match score and clears those totals for a rematch', () => {
        const room = setupMatch();
        let session = room.session!;
        session.getScoreManager().recordDamage('left', 40);
        session.getScoreManager().recordResourceUsed('left', 2);
        session.getStateMachine().startCombatPhase();
        session.getPlayerState('socket-2')!.kingState.hp = 0;
        session.getStateMachine().checkKingDefeat();
        vi.advanceTimersByTime(ROUND_INTERSTITIAL_MS);
        session = room.session!;
        session.handlePlayerBuildReady('socket-1');
        session.handlePlayerBuildReady('socket-2');
        vi.advanceTimersByTime(5000);
        session.getScoreManager().recordDamage('left', 70);
        session.getScoreManager().recordResourceUsed('left', 3);
        session.getPlayerState('socket-2')!.kingState.hp = 0;
        session.getStateMachine().checkKingDefeat();
        const scores = emitFn.mock.calls.find(call => call[0] === 'match_scores')![1];
        expect(scores.left.damageDealt).toBe(110);
        expect(scores.left.resourcesUsed).toBe(5);
        rm.requestRematch('socket-1'); rm.requestRematch('socket-2');
        expect(room.scoreManager.computeScores('left').left.damageDealt).toBe(0);
    });
});
