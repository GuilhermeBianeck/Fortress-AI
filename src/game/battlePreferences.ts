export type CameraMode = 'follow' | 'turn' | 'manual';
export interface BattlePreferences { camera: CameraMode; motion: 'system' | 'reduced'; hitLabels: boolean }
export const DEFAULT_BATTLE_PREFERENCES: BattlePreferences = { camera: 'follow', motion: 'system', hitLabels: true };
const KEY = 'fortress_battle_preferences';

export function parseBattlePreferences(value: unknown): BattlePreferences {
    const input = value && typeof value === 'object' ? value as Partial<BattlePreferences> : {};
    return {
        camera: ['follow', 'turn', 'manual'].includes(input.camera ?? '') ? input.camera! : 'follow',
        motion: input.motion === 'reduced' ? 'reduced' : 'system',
        hitLabels: typeof input.hitLabels === 'boolean' ? input.hitLabels : true,
    };
}
export function readBattlePreferences(): BattlePreferences {
    try { return parseBattlePreferences(JSON.parse(localStorage.getItem(KEY) ?? 'null')); }
    catch { return { ...DEFAULT_BATTLE_PREFERENCES }; }
}
export function saveBattlePreferences(value: BattlePreferences) {
    try { localStorage.setItem(KEY, JSON.stringify(parseBattlePreferences(value))); } catch { /* Session settings still work without storage. */ }
}
