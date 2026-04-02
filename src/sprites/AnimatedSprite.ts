/**
 * Frame-based animated sprite. Cycles through named sprite frames at a fixed rate.
 */

import { sprites } from './SpriteLoader';

interface AnimationDef {
    frames: string[];
    frameTimeMs: number;
    loop: boolean;
}

export class AnimatedSprite {
    private currentFrame = 0;
    private elapsed = 0;
    private _finished = false;

    constructor(private anim: AnimationDef) {}

    update(dtMs: number): void {
        if (this._finished) return;
        this.elapsed += dtMs;
        if (this.elapsed >= this.anim.frameTimeMs) {
            this.elapsed -= this.anim.frameTimeMs;
            this.currentFrame++;
            if (this.currentFrame >= this.anim.frames.length) {
                if (this.anim.loop) {
                    this.currentFrame = 0;
                } else {
                    this.currentFrame = this.anim.frames.length - 1;
                    this._finished = true;
                }
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
        const sprite = sprites.get(this.anim.frames[this.currentFrame]);
        if (sprite) {
            ctx.drawImage(sprite, x, y, w, h);
        }
    }

    reset(): void {
        this.currentFrame = 0;
        this.elapsed = 0;
        this._finished = false;
    }

    get finished(): boolean {
        return this._finished;
    }
}

// Pre-defined animation definitions
export const ANIMATIONS = {
    kingIdle: { frames: ['king_idle_0', 'king_idle_1'], frameTimeMs: 500, loop: true },
    lavaBubble: { frames: ['lava_0', 'lava_1', 'lava_2', 'lava_3'], frameTimeMs: 200, loop: true },
    explosion: { frames: ['explosion_0', 'explosion_1', 'explosion_2', 'explosion_3'], frameTimeMs: 80, loop: false },
    spark: { frames: ['spark_0', 'spark_1', 'spark_2'], frameTimeMs: 60, loop: false },
} as const;
