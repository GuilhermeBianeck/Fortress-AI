import type { MatchPhase, Side } from '../types';

export type KingPose = 'idle' | 'hit' | 'victory' | 'defeat';
export const KING_HIT_MS = 480;

export function kingPresentation({ now, side, phase, winner, hitAt, resultAt, reducedMotion = false }: {
    now: number; side: Side; phase: MatchPhase; winner?: Side | null; hitAt?: number; resultAt?: number; reducedMotion?: boolean;
}) {
    let pose: KingPose = 'idle';
    if (phase === 'result' && winner) pose = winner === side ? 'victory' : 'defeat';
    else if (hitAt !== undefined && now >= hitAt && now - hitAt < KING_HIT_MS) pose = 'hit';
    if (reducedMotion) return { pose, scaleY: 1, tilt: 0, reactionOpacity: pose === 'idle' ? 0 : 1 };
    const smooth = (n: number) => { const x = Math.max(0, Math.min(1, n)); return x * x * (3 - 2 * x); };
    const reactionOpacity = pose === 'hit' ? Math.min(smooth((now - hitAt!) / 90), smooth((KING_HIT_MS - now + hitAt!) / 140))
        : pose === 'idle' ? 0 : resultAt === undefined ? 1 : smooth((now - resultAt) / 160);
    const flinch = pose === 'hit' ? Math.sin((now - hitAt!) / KING_HIT_MS * Math.PI) : 0;
    const breath = pose === 'idle' || pose === 'victory' ? Math.sin(now * 0.0025) * 0.008 : 0;
    return { pose, scaleY: 1 + breath - flinch * 0.035, tilt: -flinch * 0.035, reactionOpacity };
}
