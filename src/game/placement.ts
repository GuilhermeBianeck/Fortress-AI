import type { ShapeType, Side, Vector } from '../types';
import { WORLD_WIDTH } from '../types';

// Mirrors server/config/constants.ts; the parity fixture guards these dimensions.
export const PLACEMENT_DIMENSIONS: Record<ShapeType, readonly [number, number]> = {
    rectangle: [30, 30], pillar: [30, 90], beam: [90, 15],
};

export function canPlace(point: Vector, side: Side): boolean {
    const left = side === 'left' ? 0 : WORLD_WIDTH / 2;
    const right = side === 'left' ? WORLD_WIDTH / 2 : WORLD_WIDTH;
    return Number.isFinite(point.x) && Number.isFinite(point.y) &&
        point.x >= left && point.x <= right && point.y >= -200 && point.y <= 700;
}
