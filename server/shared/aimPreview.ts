export const AIM_UPDATE_MS = 100;
export const AIM_STALE_MS = 900;
export interface AimInput { epoch: string; angle: number; power: number; charging: boolean }
export interface AimPreview extends AimInput { side: 'left' | 'right'; sequence: number }
export interface AimState { epoch: string; preview: AimPreview | null }

export function validAimInput(value: unknown): value is AimInput {
    if (!value || typeof value !== 'object') return false;
    const v = value as Partial<AimInput>;
    return typeof v.epoch === 'string' && v.epoch.length <= 64 && typeof v.charging === 'boolean'
        && typeof v.angle === 'number' && Number.isFinite(v.angle) && v.angle >= Math.PI / 18 && v.angle <= Math.PI * 17 / 18
        && typeof v.power === 'number' && Number.isFinite(v.power) && v.power >= 5 && v.power <= 100;
}
