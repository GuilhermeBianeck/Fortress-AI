import manifest from '../../asset-workbench/living-kings-v6/manifest.json';
import type { Side } from '../types';

export type LivingKingPart = 'body' | 'head_open' | 'head_closed' | 'arm' | 'cape' | 'chest';
export interface LivingKingOptions {
    side: Side;
    now: number;
    height?: number;
    reducedMotion?: boolean;
    shootAt?: number;
    /** Look intent in the caller's already-facing local space, from -1 to 1. */
    looking?: number;
}
const images = new Map<string, CanvasImageSource>();
export function registerLivingKingImage(side: Side, part: LivingKingPart, image: CanvasImageSource) { images.set(`${side}:${part}`, image); }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const pulse = (phase: number, start: number, duration: number) => phase < start || phase > start + duration ? 0 : Math.sin((phase - start) / duration * Math.PI) ** 2;

/** Pure elapsed-time motion; boots and the body base never move or squash. */
export function livingKingState({ now, side, reducedMotion = false, shootAt, looking = 0 }: LivingKingOptions) {
    const t = Math.max(0, Number.isFinite(now) ? now : 0);
    if (reducedMotion) return { headTilt: 0, headX: 0, headY: 0, chestScaleX: 1, chestScaleY: 1, shoulderY: 0, armAngle: 0, capeAngle: 0, capeScaleX: 1, blink: false, gesture: 0, breath: 0 };
    const offset = side === 'left' ? 0 : 1730;
    const breath = Math.sin((t + offset) * .00175);
    const gesture = pulse((t + offset) % 11400, 5200, 1800);
    const shotAge = shootAt === undefined ? -1 : t - shootAt;
    const shot = shotAge >= 0 && shotAge < 400 ? Math.sin(shotAge / 400 * Math.PI) : 0;
    const blinkTime = (t + offset) % 5300;
    return {
        headTilt: Math.sin((t + offset) * .00063) * .018 + clamp(looking, -1, 1) * .025 - shot * .025,
        headX: Math.sin((t + offset) * .00041) * .45,
        headY: -breath * .65,
        chestScaleX: 1 + breath * .004,
        chestScaleY: 1 + breath * .016,
        shoulderY: -breath * .5,
        armAngle: Math.sin((t + offset) * .0012) * .018 - gesture * .18 - shot * .09,
        capeAngle: Math.sin((t + offset) * .0011) * .032 + Math.sin((t + offset) * .0023) * .008,
        capeScaleX: 1 + Math.sin((t + offset) * .0015) * .025,
        blink: blinkTime >= 2700 && blinkTime < 2820,
        gesture, breath,
    };
}

export function livingKingAttachments(options: LivingKingOptions) {
    const state = livingKingState(options);
    return manifest.assets.filter(part => part.side === options.side).map(part => ({
        part: part.part as LivingKingPart,
        x: part.anchor.x + (part.part.startsWith('head') ? state.headX : 0),
        y: part.anchor.y + (part.part.startsWith('head') ? state.headY : part.part === 'arm' ? state.shoulderY : 0),
        angle: part.part.startsWith('head') ? state.headTilt : part.part === 'arm' ? state.armAngle : part.part === 'cape' ? state.capeAngle : 0,
        scaleX: part.part === 'chest' ? state.chestScaleX : part.part === 'cape' ? state.capeScaleX : 1,
        scaleY: part.part === 'chest' ? state.chestScaleY : 1,
    }));
}

/** Caller supplies foot origin, facing and world rotation. No whole-body transform here. */
export function drawLivingKing(ctx: CanvasRenderingContext2D, options: LivingKingOptions): boolean {
    const parts = manifest.assets.filter(asset => asset.side === options.side);
    if (parts.length !== 6 || parts.some(part => !images.has(`${options.side}:${part.part}`))) return false;
    const state = livingKingState(options);
    const attachments = livingKingAttachments(options);
    const order: LivingKingPart[] = ['cape', 'body', 'chest', 'arm', state.blink ? 'head_closed' : 'head_open'];
    ctx.save();
    const scale = Math.max(1, options.height ?? 80) / manifest.unitHeight;
    ctx.scale(scale, scale);
    for (const name of order) {
        const part = parts.find(part => part.part === name)!;
        const pose = attachments.find(pose => pose.part === name)!;
        ctx.save(); ctx.translate(pose.x, pose.y); ctx.rotate(pose.angle); ctx.scale(pose.scaleX, pose.scaleY);
        ctx.drawImage(images.get(`${options.side}:${name}`)!, -part.pivot.x, -part.pivot.y, part.width, part.height);
        ctx.restore();
    }
    ctx.restore();
    return true;
}
