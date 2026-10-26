// DDTank-style hold-to-fire: power climbs from the minimum to 100 while held, and a full
// bar fires on its own. Power maps to speed on the server (shared/combatTuning).
export const CHARGE_DURATION_MS = 3000;
export const MIN_POWER = 5;
export const MAX_POWER = 100;

export function chargePower(elapsedMs: number): number {
    const t = Math.max(0, Math.min(1, elapsedMs / CHARGE_DURATION_MS));
    return Math.round((MIN_POWER + (MAX_POWER - MIN_POWER) * t) * 10) / 10;
}
