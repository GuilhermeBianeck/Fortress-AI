import type { GameState, KingHpState, Side, Vector } from '../types';
import { WORLD_WIDTH } from '../types';

export function kingFeedbackPosition(side: Side, state: GameState | null, lastKnown: KingHpState): Vector {
    const king = state?.kings[side];
    return {
        x: king?.x ?? lastKnown.x ?? (side === 'left' ? WORLD_WIDTH / 4 : WORLD_WIDTH * 3 / 4),
        y: king?.y ?? lastKnown.y ?? 480,
    };
}
