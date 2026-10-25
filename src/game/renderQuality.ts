/** Keep high-density canvases sharp when affordable; avoid supersampling at the cost of motion. */
export class RenderQuality {
    maxRatio = 3;
    private elapsed = 0;
    private renderTime = 0;
    private frames = 0;
    private goodWindows = 0;

    record(frameMs: number, renderMs: number) {
        if (!Number.isFinite(frameMs) || !Number.isFinite(renderMs) || frameMs <= 0 || frameMs > 250 || renderMs < 0) {
            this.elapsed = this.renderTime = this.frames = this.goodWindows = 0;
            return;
        }
        this.elapsed += frameMs;
        this.renderTime += renderMs;
        this.frames++;
        if (this.elapsed < 1000 || this.frames < 10) return;
        const average = this.elapsed / this.frames;
        if (average > 23.5) {
            this.maxRatio = Math.max(1, this.maxRatio - 0.5);
            this.goodWindows = 0;
        } else if (average < 18 && this.renderTime / this.frames < 5) {
            if (++this.goodWindows >= 20) {
                this.maxRatio = Math.min(3, this.maxRatio + 0.5);
                this.goodWindows = 0;
            }
        } else this.goodWindows = 0;
        this.elapsed = this.renderTime = this.frames = 0;
    }
}
