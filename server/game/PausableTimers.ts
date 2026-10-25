export type TimerId = number;
interface Timer { callback: () => void; remaining: number; due: number; interval?: number; handle?: ReturnType<typeof setTimeout> }

/** Simulation clock: wall-clock reconnect deadlines deliberately live elsewhere. */
export class PausableTimers {
    private timers = new Map<TimerId, Timer>();
    private nextId = 1;
    private paused = false;
    private disposed = false;
    timeout(callback: () => void, ms: number): TimerId { return this.add(callback, ms); }
    interval(callback: () => void, ms: number): TimerId { return this.add(callback, ms, ms); }
    private add(callback: () => void, ms: number, interval?: number): TimerId {
        const id = this.nextId++;
        if (this.disposed) return id;
        const timer: Timer = { callback, remaining: ms, due: 0, interval };
        this.timers.set(id, timer);
        if (!this.paused) this.schedule(id, timer);
        return id;
    }
    private schedule(id: TimerId, timer: Timer): void {
        timer.due = Date.now() + timer.remaining;
        timer.handle = setTimeout(() => {
            timer.handle = undefined;
            if (!this.timers.has(id) || this.paused || this.disposed) return;
            if (!timer.interval) this.timers.delete(id);
            else timer.remaining = timer.interval;
            timer.callback();
            if (timer.interval && this.timers.has(id) && !this.paused && !this.disposed) this.schedule(id, timer);
        }, timer.remaining);
    }
    clear(id?: TimerId | null): void {
        if (id == null) return;
        clearTimeout(this.timers.get(id)?.handle);
        this.timers.delete(id);
    }
    pause(): void {
        if (this.paused) return;
        this.paused = true;
        for (const timer of this.timers.values()) {
            timer.remaining = Math.max(0, timer.due - Date.now());
            clearTimeout(timer.handle); timer.handle = undefined;
        }
    }
    resume(): void {
        if (!this.paused || this.disposed) return;
        this.paused = false;
        for (const [id, timer] of this.timers) this.schedule(id, timer);
    }
    dispose(): void {
        this.disposed = true;
        for (const id of this.timers.keys()) this.clear(id);
    }
    get size(): number { return this.timers.size; }
}
