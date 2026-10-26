import type { Viewport } from './viewport';
import { clampCamera } from './viewport';
import type { Vector } from '../types';

export interface BattleCameraState { x: number; target: number; velocity: number; manualUntil: number; initialized: boolean }
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

export function resizeBattleCamera(camera: BattleCameraState, before: Viewport, after: Viewport) {
    const shift = (before.worldWidth - after.worldWidth) / 2;
    camera.x = clampCamera(camera.x + shift, after);
    camera.target = clampCamera(camera.target + shift, after);
}

/** Critically damped, speed-bounded travel in viewport units; no frame-rate-specific lerp. */
export function advanceBattleCamera(camera: BattleCameraState, view: Viewport, deltaMs: number, reveal = false, reduced = false, manual = false) {
    camera.target = clampCamera(camera.target, view);
    if (reduced) { camera.x = camera.target; camera.velocity = 0; return; }
    const dt = Number.isFinite(deltaMs) ? Math.max(0, Math.min(50, deltaMs)) / 1000 : 0;
    if (!dt) return;
    const omega = manual ? 12 : reveal ? 3.5 : 6;
    const maxSpeed = view.worldWidth * (manual ? 3.2 : 1.65);
    const change = clamp(camera.x - camera.target, maxSpeed / omega);
    const temporaryTarget = camera.x - change;
    const c = camera.velocity + omega * change;
    const decay = Math.exp(-omega * dt);
    const next = temporaryTarget + (change + c * dt) * decay;
    camera.velocity = clamp((camera.velocity - omega * c * dt) * decay, maxSpeed);
    camera.x = clampCamera(next, view);
    if (Math.abs(camera.x - camera.target) < 0.05 && Math.abs(camera.velocity) < 0.1) {
        camera.x = camera.target; camera.velocity = 0;
    }
}

/** Leave the view steady until the shot exits the central tracking band. */
export function projectileCameraTarget(x: number, camera: BattleCameraState, view: Viewport) {
    const left = camera.x + view.worldWidth * 0.3, right = camera.x + view.worldWidth * 0.7;
    return x < left ? x - view.worldWidth * 0.3 : x > right ? x - view.worldWidth * 0.7 : camera.target;
}

/** Follow displayed positions. Raw physics velocity is not a wall-clock prediction. */
export function trackBattleCamera(camera: BattleCameraState, view: Viewport, point: Vector, velocity: Vector, deltaMs: number, safeTop: number) {
    const dt = Number.isFinite(deltaMs) ? Math.max(0, Math.min(50, deltaMs)) : 0;
    const weight = 1 - Math.exp(-dt / 75);
    camera.target = clampCamera(point.x - view.worldWidth * (velocity.x >= 0 ? 0.43 : 0.57), view);
    const previous = camera.x;
    camera.x += (camera.target - camera.x) * weight;
    camera.x = clampCamera(Math.max(point.x - view.worldWidth * 0.84, Math.min(point.x - view.worldWidth * 0.16, camera.x)), view);
    camera.velocity = dt > 0 ? (camera.x - previous) * 1000 / dt : 0;
    const baseline = 600 - view.worldHeight;
    const low = point.y - (view.height - 28) / view.scale;
    const high = point.y - Math.min(view.height - 44, safeTop) / view.scale;
    // Keep the terrain anchored unless the arc actually leaves the readable band.
    const top = Math.max(low, Math.min(high, baseline));
    view.top += (top - view.top) * weight;
    view.top = Math.max(low, Math.min(high, view.top));
}
