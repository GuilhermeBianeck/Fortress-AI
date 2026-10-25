export const CANNON_KING_GAP = 160;

/** Place the cannon on the attacking side of its royal, outside the king's plinth. */
export function kingCannonX(side: 'left' | 'right', kingX: number, worldWidth = 2400): number {
    const min = side === 'left' ? 0 : worldWidth / 2;
    const max = side === 'left' ? worldWidth / 2 : worldWidth;
    return Math.max(min + 60, Math.min(max - 60, kingX + (side === 'left' ? CANNON_KING_GAP : -CANNON_KING_GAP)));
}
