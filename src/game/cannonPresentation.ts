import art from '../../asset-workbench/cartoon-v1/asset-manifest.json';
import type { Side, Vector } from '../types';
import { cannonPosition } from './ballistics';

const barrel = art.assets.find(asset => asset.name === 'cannon_barrel')!;
export const CANNON_ART = {
    baseWidth: 78, barrelWidth: 105, originY: -9,
    // Center of the painted muzzle aperture in the normalized barrel image.
    muzzle: { x: 724, y: 160 },
};
export const MUZZLE_LOCAL = {
    x: (CANNON_ART.muzzle.x - barrel.pivot.x) * CANNON_ART.barrelWidth / barrel.outputInfo.width,
    y: (CANNON_ART.muzzle.y - barrel.pivot.y) * CANNON_ART.barrelWidth / barrel.outputInfo.width,
};

/** Visual attachment only: never changes the server's projectile launch position. */
export function cannonMuzzle(side: Side, angle: number, points: readonly Vector[], cannons?: Partial<Record<Side, Vector>>): Vector {
    const origin = cannonPosition(side, points, cannons);
    const facing = side === 'left' ? 1 : -1;
    return {
        x: origin.x + facing * (MUZZLE_LOCAL.x * Math.cos(angle) + MUZZLE_LOCAL.y * Math.sin(angle)),
        y: origin.y + CANNON_ART.originY - MUZZLE_LOCAL.x * Math.sin(angle) + MUZZLE_LOCAL.y * Math.cos(angle),
    };
}
