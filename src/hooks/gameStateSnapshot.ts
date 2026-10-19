import type { BodyState, CompactGameState, GameState } from '../types';

const NULL_HP_SENTINEL = -1;

export function reconstructGameState(
    previousCache: ReadonlyMap<number, BodyState>,
    data: CompactGameState,
): { bodyCache: Map<number, BodyState>; gameState: GameState } {
    const bodyCache = data.f === 1
        ? new Map<number, BodyState>()
        : new Map(previousCache);

    for (const body of data.n ?? []) {
        bodyCache.set(body.id, {
            ...body,
            position: { ...body.position },
            velocity: { ...body.velocity },
        });
    }

    for (const [id, x, y, angle, vx, vy, hp] of data.u ?? []) {
        const existing = bodyCache.get(id);
        if (!existing) continue; // Metadata arrives in a new-body entry or full sync.

        // Published bodies are immutable endpoints for renderer interpolation.
        bodyCache.set(id, {
            ...existing,
            position: { x, y },
            angle,
            velocity: { x: vx, y: vy },
            blockHp: hp === NULL_HP_SENTINEL ? null : hp,
        });
    }

    for (const id of data.r ?? []) {
        bodyCache.delete(id);
    }

    return {
        bodyCache,
        gameState: {
            bodies: Array.from(bodyCache.values()),
            timestamp: data.t,
            kings: { left: { ...data.k.l }, right: { ...data.k.r } },
        },
    };
}
