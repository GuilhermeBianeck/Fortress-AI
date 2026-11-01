import type { AimPreview } from '../../server/shared/aimPreview';
// Kept equal to the CommonJS server contract by the parity regression.
export const AIM_STALE_MS = 900;
export const AIM_UPDATE_MS = 100;
export interface ReceivedAim extends AimPreview { receivedAt: number }

/** Local arrival time avoids clock skew. Stale charges never persist through a held network picture. */
export function currentOpponentAim(preview: ReceivedAim | null | undefined, now: number, turn: string | null, resolving: boolean) {
    return preview && preview.side === turn && !resolving && now >= preview.receivedAt && now - preview.receivedAt < AIM_STALE_MS ? preview : null;
}

export class OpponentBarrel {
    private angle = Math.PI / 4;
    sample(target: number, deltaMs: number, reduced: boolean) {
        this.angle = reduced ? target : this.angle + (target - this.angle) * (1 - Math.exp(-Math.max(0, deltaMs) / 90));
        return this.angle;
    }
    reset() { this.angle = Math.PI / 4; }
}
