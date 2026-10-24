import type { Side } from '../types';

export interface BattleEffect {
    x: number; y: number; at: number; kind: 'impact' | 'break' | 'damage'; damage?: number; side?: Side;
    material?: string; source?: string; hp?: number; target?: 'king' | 'block' | 'terrain'; targetId?: number; destroyed?: boolean;
}
export interface HitFeedback { caption: string; amount: string; color: string; priority: number; key: string }
export interface FeedbackRect { x: number; y: number; width: number; height: number }
export interface FeedbackCandidate extends HitFeedback { x: number; y: number; at: number }

function amount(damage: number) {
    return damage < .1 ? '<0.1' : `-${damage < 10 ? Number(damage.toFixed(1)) : Math.round(damage)}`;
}

/** Describe only server-confirmed results; legacy position-only impacts have no invented label. */
export function hitFeedback(effect: BattleEffect, labels = true): HitFeedback | null {
    if (effect.kind === 'damage' && Number.isFinite(effect.damage) && effect.damage! > 0) {
        const damage = effect.damage!;
        const defeated = effect.hp === 0;
        const projectile = effect.source === 'projectile';
        const caption = defeated ? 'DEFEATED' : effect.source === 'lava' ? 'LAVA'
            : ['fall', 'Terrain', 'foundation', 'Boundary'].includes(effect.source ?? '') ? 'FALL'
                : effect.source && !projectile ? 'CRUSH' : projectile && damage >= 50 ? 'HEAVY HIT'
                    : projectile && damage < 20 ? 'LIGHT HIT' : 'ROYAL HIT';
        return { caption: labels ? caption : '', amount: amount(damage), color: defeated || damage >= 50 ? '#ffe298' : '#fff0de',
            priority: defeated ? 120 : damage >= 50 ? 110 : 90, key: `king:${effect.side}` };
    }
    if (!labels || effect.kind !== 'impact' || effect.target !== 'block') return null;
    return { caption: effect.destroyed ? (effect.material === 'ice' ? 'SHATTERED' : 'BROKEN')
        : effect.material === 'steel' ? 'ARMOR HIT' : 'BLOCK HIT',
        amount: Number.isFinite(effect.damage) && effect.damage! > 0 ? amount(effect.damage!) : '',
        color: effect.material === 'steel' || effect.material === 'ice' ? '#ccefff' : '#fff1cd',
        priority: effect.destroyed ? 70 : 50, key: `block:${effect.targetId ?? `${effect.x}:${effect.y}`}` };
}

function overlaps(a: FeedbackRect, b: FeedbackRect) {
    return a.x < b.x + b.width + 6 && a.x + a.width + 6 > b.x && a.y < b.y + b.height + 6 && a.y + a.height + 6 > b.y;
}

/** Keep the most important cues legible without covering health panels, minimap or other cues. */
export function layoutHitFeedback(candidates: FeedbackCandidate[], width: number, height: number, excluded: FeedbackRect[]) {
    const placed: (FeedbackCandidate & { box: FeedbackRect })[] = [], keys = new Set<string>();
    const occupied = [...excluded];
    for (const cue of [...candidates].sort((a, b) => b.priority - a.priority || b.at - a.at)) {
        if (keys.has(cue.key)) continue;
        const w = Math.min(132, width - 16), h = cue.caption && cue.amount ? 45 : 28;
        let box: FeedbackRect | undefined;
        for (const dy of [0, -52, 52, -104]) {
            for (const dx of [0, -80, 80]) {
                const candidate = { x: Math.max(8, Math.min(width - w - 8, cue.x - w / 2 + dx)),
                    y: Math.max(8, Math.min(height - h - 8, cue.y - h + dy)), width: w, height: h };
                if (!occupied.some(rect => overlaps(candidate, rect))) { box = candidate; break; }
            }
            if (box) break;
        }
        if (!box) continue;
        keys.add(cue.key); occupied.push(box); placed.push({ ...cue, box });
        if (placed.length >= (width < 600 ? 3 : 6)) break;
    }
    return placed;
}
