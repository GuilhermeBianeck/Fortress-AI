import { randomUUID } from 'node:crypto';
import { AIM_UPDATE_MS, validAimInput, type AimState, type AimPreview } from '../shared/aimPreview';

/** Cosmetic state only. The session separately checks authenticated turn ownership. */
export class AimPreviewState {
    private epoch = randomUUID();
    private preview: AimPreview | null = null;
    private lastAt = -Infinity;
    private sequence = 0;
    reset(): AimState {
        this.epoch = randomUUID(); this.preview = null; this.lastAt = -Infinity; this.sequence = 0;
        return this.state();
    }
    state(): AimState { return { epoch: this.epoch, preview: this.preview ? { ...this.preview } : null }; }
    accept(value: unknown, side: 'left' | 'right', now: number): AimState | null {
        if (!validAimInput(value) || value.epoch !== this.epoch) return null;
        // Permit one immediate cancellation of an accepted charge; repeated cancels cannot flood.
        const cancel = !value.charging && this.preview?.charging;
        if (now - this.lastAt < AIM_UPDATE_MS && !cancel) return null;
        if (!cancel) this.lastAt = now;
        this.preview = { epoch: this.epoch, side, angle: value.angle, power: value.power,
            charging: value.charging, sequence: ++this.sequence };
        return this.state();
    }
}
