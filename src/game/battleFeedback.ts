import type { BodyState, GameState, KingHpState, Side, Vector } from '../types';
import { WORLD_WIDTH } from '../types';

export function projectileOwner(body: Pick<BodyState, 'side' | 'position'>): Side {
    return body.side ?? (body.position.x < WORLD_WIDTH / 2 ? 'left' : 'right');
}

export function currentShotInFlight(bodies: Pick<BodyState, 'side' | 'position' | 'label' | 'velocity'>[], turn: Side | null, accepted: boolean): boolean {
    return accepted && turn !== null && bodies.some(body => body.label === 'projectile' && projectileOwner(body) === turn
        && Math.hypot(body.velocity.x, body.velocity.y) > 1);
}

export function kingFeedbackPosition(side: Side, state: GameState | null, lastKnown: KingHpState): Vector {
    const king = state?.kings[side];
    return {
        x: king?.x ?? lastKnown.x ?? (side === 'left' ? WORLD_WIDTH / 4 : WORLD_WIDTH * 3 / 4),
        y: king?.y ?? lastKnown.y ?? 480,
    };
}
