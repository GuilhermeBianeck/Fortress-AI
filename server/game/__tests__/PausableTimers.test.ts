import { afterEach, expect, it, vi } from 'vitest';
import { PausableTimers } from '../PausableTimers';
afterEach(() => vi.useRealTimers());
it('preserves remaining time, suppresses catch-up bursts, and disposes paused work', () => {
    vi.useFakeTimers(); const timers = new PausableTimers(); const timeout = vi.fn(), interval = vi.fn();
    timers.timeout(timeout, 5000); timers.interval(interval, 1000);
    vi.advanceTimersByTime(1250); timers.pause(); vi.advanceTimersByTime(15000);
    expect(interval).toHaveBeenCalledTimes(1); expect(timeout).not.toHaveBeenCalled();
    timers.resume(); vi.advanceTimersByTime(749); expect(interval).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3001); expect(timeout).toHaveBeenCalledTimes(1);
    timers.pause(); timers.dispose(); timers.resume(); vi.advanceTimersByTime(50000);
    expect(timers.size).toBe(0); expect(timeout).toHaveBeenCalledTimes(1);
});
