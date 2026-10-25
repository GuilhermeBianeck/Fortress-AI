export type BotDifficulty = 'easy' | 'normal' | 'hard';
export const BOT_DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export function botDifficulty(value: unknown): BotDifficulty {
    return value === 'easy' || value === 'hard' ? value : 'normal';
}
export const BOT_SKILL = {
    easy: { initialOffset: 220, offsetRange: 60, uncertainty: 48, minimumUncertainty: 24, uncertaintyStep: 3, decay: 0.9, correction: 0.4, hitDecay: 0.85, thinkMs: 2200 },
    normal: { initialOffset: 140, offsetRange: 40, uncertainty: 18, minimumUncertainty: 7, uncertaintyStep: 3, decay: 0.75, correction: 0.7, hitDecay: 0.65, thinkMs: 1500 },
    hard: { initialOffset: 55, offsetRange: 25, uncertainty: 9, minimumUncertainty: 3, uncertaintyStep: 2, decay: 0.55, correction: 0.85, hitDecay: 0.45, thinkMs: 1100 },
} as const;
