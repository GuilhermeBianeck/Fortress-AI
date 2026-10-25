import type { Vector } from '../types';
import { WORLD_WIDTH } from '../types';

export interface Viewport {
    width: number;
    height: number;
    scale: number;
    worldWidth: number;
    worldHeight: number;
    top: number;
}

export function createViewport(width: number, height: number, overview = false): Viewport {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const worldHeight = h < 320 && w / h > 1.8 && !overview ? 360 : 560;
    const scale = Math.min(1.35, h / worldHeight);
    return { width: w, height: h, scale, worldWidth: w / scale, worldHeight: h / scale, top: 600 - h / scale };
}

// A little space outside the physics world keeps edge-mounted cannons in frame.
export function clampCamera(x: number, view: Viewport): number {
    const left = -90;
    const right = Math.max(left, WORLD_WIDTH + 90 - view.worldWidth);
    return Math.max(left, Math.min(right, x));
}

export function screenToWorld(point: Vector, cameraX: number, view: Viewport): Vector {
    return { x: cameraX + point.x / view.scale, y: view.top + point.y / view.scale };
}

export function worldToScreen(point: Vector, cameraX: number, view: Viewport): Vector {
    return { x: (point.x - cameraX) * view.scale, y: (point.y - view.top) * view.scale };
}

export function minimapRect(view: Viewport) {
    const width = Math.min(176, Math.max(108, view.width * 0.27));
    return { x: view.width - width - 10, y: view.height - 54, width, height: 44 };
}

export function showBattleMinimap(view: Viewport): boolean {
    return view.width >= 900 && view.height >= 320;
}
