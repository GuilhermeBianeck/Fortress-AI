import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScoreManager } from '../ScoreManager';
import {
    SCORE_DAMAGE_MULTIPLIER,
    SCORE_RESOURCE_MAX_BONUS,
    SCORE_WIN_BONUS,
    SCORE_AI_SYNERGY_BASE,
} from '../../config/constants';

describe('ScoreManager', () => {
    it('excludes paused wall time from combat scoring', () => {
        vi.useFakeTimers();
        try {
            const score = new ScoreManager(); score.startCombatTimer();
            vi.advanceTimersByTime(2000); score.pause(); vi.advanceTimersByTime(20000);
            expect(score.getCombatTimeMs()).toBe(2000);
            score.resume(); vi.advanceTimersByTime(1000); score.stopCombatTimer();
            expect(score.getCombatTimeMs()).toBe(3000);
        } finally { vi.useRealTimers(); }
    });
    let sm: ScoreManager;

    beforeEach(() => {
        sm = new ScoreManager();
    });

    describe('recordDamage', () => {
        it('accumulates damage for each side independently', () => {
            sm.recordDamage('left', 10);
            sm.recordDamage('left', 5);
            sm.recordDamage('right', 20);

            const scores = sm.computeScores('left');
            expect(scores.left.damageDealt).toBe(15);
            expect(scores.right.damageDealt).toBe(20);
        });
    });

    describe('recordResourceUsed', () => {
        it('accumulates resources per side', () => {
            sm.recordResourceUsed('left', 5);
            sm.recordResourceUsed('left', 3);

            const scores = sm.computeScores('left');
            expect(scores.left.resourcesUsed).toBe(8);
        });

        it('defaults to 1 when no count specified', () => {
            sm.recordResourceUsed('right');
            const scores = sm.computeScores('left');
            expect(scores.right.resourcesUsed).toBe(1);
        });
    });

    describe('computeScores', () => {
        it('gives winner the win bonus', () => {
            const scores = sm.computeScores('left');
            expect(scores.left.winBonus).toBe(SCORE_WIN_BONUS);
            expect(scores.right.winBonus).toBe(0);
        });

        it('calculates damage points proportionally', () => {
            sm.recordDamage('left', 10);
            const scores = sm.computeScores('left');
            expect(scores.left.damagePoints).toBe(Math.round(10 * SCORE_DAMAGE_MULTIPLIER));
        });

        it('gives max resource bonus when no resources used', () => {
            const scores = sm.computeScores('left');
            expect(scores.left.resourceBonus).toBe(SCORE_RESOURCE_MAX_BONUS);
        });

        it('gives zero resource bonus at threshold', () => {
            sm.recordResourceUsed('left', 50); // SCORE_RESOURCE_THRESHOLD = 50
            const scores = sm.computeScores('left');
            expect(scores.left.resourceBonus).toBe(0);
        });

        it('gives time bonus only to the winner', () => {
            sm.startCombatTimer();
            sm.stopCombatTimer();
            const scores = sm.computeScores('left');
            expect(scores.left.timeBonus).toBeGreaterThanOrEqual(0);
            expect(scores.right.timeBonus).toBe(0);
        });

        it('gives AI synergy bonus when AI blocks are used', () => {
            sm.recordResourceUsed('left', 10);
            sm.recordAIBuild('left', 10);
            const scores = sm.computeScores('left');
            // 100% AI ratio: should get base + (max - base) = max
            expect(scores.left.aiSynergyBonus).toBeGreaterThanOrEqual(SCORE_AI_SYNERGY_BASE);
        });

        it('gives zero AI synergy bonus when no AI blocks used', () => {
            sm.recordResourceUsed('left', 10);
            const scores = sm.computeScores('left');
            expect(scores.left.aiSynergyBonus).toBe(0);
        });

        it('total score is sum of all components', () => {
            sm.recordDamage('left', 5);
            sm.recordResourceUsed('left', 10);
            const scores = sm.computeScores('left');
            const s = scores.left;
            expect(s.totalScore).toBe(
                s.damagePoints + s.resourceBonus + s.timeBonus + s.winBonus + s.aiSynergyBonus
            );
        });
    });

    describe('reset', () => {
        it('clears all accumulated state', () => {
            sm.recordDamage('left', 100);
            sm.recordResourceUsed('left', 50);
            sm.recordAIBuild('left', 25);
            sm.startCombatTimer();
            sm.stopCombatTimer();

            sm.reset();

            const scores = sm.computeScores('left');
            expect(scores.left.damageDealt).toBe(0);
            expect(scores.left.resourcesUsed).toBe(0);
            expect(scores.left.aiBlocksUsed).toBe(0);
            expect(scores.left.combatTimeMs).toBe(0);
        });
    });

    it('combines round statistics without counting breaks or awarding multiple win bonuses', () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(100000);
            const first = new ScoreManager(), second = new ScoreManager();
            first.startCombatTimer();
            first.recordDamage('left', 60); first.recordResourceUsed('left', 2); first.recordAIBuild('left', 1);
            vi.advanceTimersByTime(2000); sm.absorbRound(first);
            vi.advanceTimersByTime(4000);
            second.startCombatTimer();
            second.recordDamage('left', 100); second.recordResourceUsed('left', 3); second.recordAIBuild('left', 2);
            vi.advanceTimersByTime(3000); sm.absorbRound(second);
            const score = sm.computeScores('left').left;
            expect(score.combatTimeMs).toBe(5000);
            expect(score.damageDealt).toBe(160);
            expect(score.resourcesUsed).toBe(5);
            expect(score.aiBlocksUsed).toBe(3);
            expect(score.winBonus).toBe(SCORE_WIN_BONUS);
            sm.reset(); expect(sm.getCombatTimeMs()).toBe(0);
        } finally { vi.useRealTimers(); }
    });
});
