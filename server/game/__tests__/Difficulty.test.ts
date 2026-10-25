import { afterEach, expect, it, vi } from 'vitest';
import { BotAI } from '../BotAI';
import { PausableTimers } from '../PausableTimers';
import { BOT_DIFFICULTIES, BOT_SKILL, botDifficulty } from '../../shared/difficulty';
import { benchmarkDifficulty } from '../../scripts/benchmarkDifficulty';
import { RoomManager } from '../RoomManager';
import type { Server } from 'socket.io';

afterEach(() => vi.useRealTimers());
it('validates modes and retains difficulty and a new unique match ID for rematches', () => {
    expect(botDifficulty('impossible')).toBe('normal'); expect(botDifficulty(undefined)).toBe('normal');
    const manager = new RoomManager({ to: () => ({ emit: vi.fn() }), sockets: { sockets: new Map() } } as unknown as Server);
    try {
        const room = manager.createRoom('human', 'Player', 'single', 'hard'); const id = room.matchId;
        manager.startMatch(room.id); room.phase = 'result'; manager.requestRematch('human');
        expect(room.difficulty).toBe('hard'); expect(room.matchId).not.toBe(id); expect(room.matchId).not.toBe(room.id);
    } finally { manager.destroy(); }
});
it('has identical blueprints across levels and preserves pending thinking time through pause', () => {
    vi.useFakeTimers(); const plans: unknown[][] = [];
    for (const difficulty of BOT_DIFFICULTIES) {
        const timers = new PausableTimers(), blocks: unknown[] = [], getScene = vi.fn(() => { throw new Error('scene sentinel'); });
        const bot = new BotAI('left', { random: () => 0.3, getKingPosition: () => ({ x: 600, y: 480 }), getFoundationTopY: () => 512,
            getBallisticsScene: getScene, canBuild: () => true, canFire: () => true, spawnBlock: (...args) => blocks.push(args), fireProjectile: () => 1 }, difficulty, timers);
        bot.buildFortress(); vi.advanceTimersByTime(2000); plans.push(blocks);
        bot.takeTurn(); vi.advanceTimersByTime(500); timers.pause(); vi.advanceTimersByTime(15000);
        expect(getScene).not.toHaveBeenCalled(); timers.resume(); vi.advanceTimersByTime(BOT_SKILL[difficulty].thinkMs - 501);
        expect(getScene).not.toHaveBeenCalled(); expect(() => vi.advanceTimersByTime(1)).toThrow('scene sentinel');
        bot.destroy(); timers.dispose();
    }
    expect(plans[0]).toEqual(plans[1]); expect(plans[1]).toEqual(plans[2]); expect(plans[0]).toHaveLength(10);
});
it('learns with real Matter replays across 12 seeds and both sides in the expected aggregate order', () => {
    const report = benchmarkDifficulty(); const { easy, normal, hard } = report.summary;
    expect(hard.earlyDistance).toBeLessThan(normal.earlyDistance); expect(normal.earlyDistance).toBeLessThan(easy.earlyDistance);
    // A successful collision stops at the king's edge, so distance cannot rank two perfect hit rates.
    expect(hard.lateHitFraction).toBeGreaterThanOrEqual(normal.lateHitFraction);
    expect(normal.lateHitFraction).toBeGreaterThan(easy.lateHitFraction);
    expect(normal.lateDistance).toBeLessThan(easy.lateDistance);
    for (const level of [easy, normal, hard]) { expect(level.shots).toBe(144); expect(level.lateDistance).toBeLessThan(level.earlyDistance); }
});
