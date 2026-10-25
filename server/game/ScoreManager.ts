import type { Side, MatchScoreBreakdown, MatchScores } from '../types';
import {
    SCORE_DAMAGE_MULTIPLIER,
    SCORE_RESOURCE_MAX_BONUS,
    SCORE_RESOURCE_THRESHOLD,
    SCORE_TIME_MAX_BONUS,
    SCORE_TIME_THRESHOLD_MS,
    SCORE_WIN_BONUS,
    SCORE_AI_SYNERGY_BASE,
    SCORE_AI_SYNERGY_MAX_BONUS,
} from '../config/constants';

export class ScoreManager {
    private damageDealt: { left: number; right: number } = { left: 0, right: 0 };
    private resourcesUsed: { left: number; right: number } = { left: 0, right: 0 };
    private aiBlocksUsed: { left: number; right: number } = { left: 0, right: 0 };
    private combatStartTime: number = 0;
    private combatEndTime: number = 0;
    private completedCombatMs: number = 0;
    private pausedAt: number | null = null;
    pause(): void { if (this.pausedAt === null) this.pausedAt = Date.now(); }
    resume(): void {
        if (this.pausedAt === null) return;
        if (this.combatStartTime && !this.combatEndTime) this.combatStartTime += Date.now() - this.pausedAt;
        this.pausedAt = null;
    }

    absorbRound(round: ScoreManager): void {
        round.stopCombatTimer();
        for (const side of ['left', 'right'] as const) {
            this.damageDealt[side] += round.damageDealt[side];
            this.resourcesUsed[side] += round.resourcesUsed[side];
            this.aiBlocksUsed[side] += round.aiBlocksUsed[side];
        }
        this.completedCombatMs += round.getCombatTimeMs();
    }

    recordDamage(attackerSide: Side, damage: number): void {
        this.damageDealt[attackerSide] += damage;
    }

    recordResourceUsed(side: Side, count: number = 1): void {
        this.resourcesUsed[side] += count;
    }

    recordAIBuild(side: Side, blockCount: number): void {
        this.aiBlocksUsed[side] += blockCount;
    }

    startCombatTimer(): void {
        this.combatStartTime = Date.now();
    }

    stopCombatTimer(): void {
        if (!this.combatEndTime) this.combatEndTime = this.pausedAt ?? Date.now();
    }

    getCombatTimeMs(): number {
        if (this.combatStartTime === 0) return this.completedCombatMs;
        const end = this.combatEndTime > 0 ? this.combatEndTime : this.pausedAt ?? Date.now();
        return this.completedCombatMs + end - this.combatStartTime;
    }

    computeScores(winner: Side): MatchScores {
        const combatTimeMs = this.getCombatTimeMs();

        const computeForSide = (side: Side): MatchScoreBreakdown => {
            const damage = this.damageDealt[side];
            const resources = this.resourcesUsed[side];
            const aiBlocks = this.aiBlocksUsed[side];
            const isWinner = side === winner;

            // Damage points: proportional to damage dealt
            const damagePoints = Math.round(damage * SCORE_DAMAGE_MULTIPLIER);

            // Resource bonus: fewer blocks used = higher bonus (linear decay)
            const resourceRatio = Math.max(0, 1 - resources / SCORE_RESOURCE_THRESHOLD);
            const resourceBonus = Math.round(resourceRatio * SCORE_RESOURCE_MAX_BONUS);

            // Time bonus: faster combat = higher bonus (linear decay, only for winner)
            let timeBonus = 0;
            if (isWinner && combatTimeMs > 0) {
                const timeRatio = Math.max(0, 1 - combatTimeMs / SCORE_TIME_THRESHOLD_MS);
                timeBonus = Math.round(timeRatio * SCORE_TIME_MAX_BONUS);
            }

            const winBonus = isWinner ? SCORE_WIN_BONUS : 0;

            // AI synergy bonus: rewarded for using AI to build the fortress
            let aiSynergyBonus = 0;
            if (aiBlocks > 0 && resources > 0) {
                const aiRatio = aiBlocks / resources;
                aiSynergyBonus = Math.round(
                    SCORE_AI_SYNERGY_BASE + aiRatio * (SCORE_AI_SYNERGY_MAX_BONUS - SCORE_AI_SYNERGY_BASE)
                );
            }

            const totalScore = damagePoints + resourceBonus + timeBonus + winBonus + aiSynergyBonus;

            return {
                damageDealt: Math.round(damage * 10) / 10,
                resourcesUsed: resources,
                combatTimeMs,
                damagePoints,
                resourceBonus,
                timeBonus,
                winBonus,
                aiBlocksUsed: aiBlocks,
                aiSynergyBonus,
                totalScore,
            };
        };

        return {
            left: computeForSide('left'),
            right: computeForSide('right'),
        };
    }

    reset(): void {
        this.damageDealt = { left: 0, right: 0 };
        this.resourcesUsed = { left: 0, right: 0 };
        this.aiBlocksUsed = { left: 0, right: 0 };
        this.combatStartTime = 0;
        this.combatEndTime = 0;
        this.completedCombatMs = 0;
        this.pausedAt = null;
    }
}
