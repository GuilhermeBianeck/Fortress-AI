/**
 * Module-level debug stats singleton.
 * NOT React state — mutated directly from the render loop and socket handlers.
 * Zero overhead when hidden (all callers guard with `debugVisible`).
 */

const BUFFER_SIZE = 300; // ~5 seconds at 60fps

// --- Visibility ---

export let debugVisible = new URLSearchParams(window.location.search).has('debug');

let memoryInterval: ReturnType<typeof setInterval> | null = null;

export function toggleDebug(): void {
    debugVisible = !debugVisible;
    if (debugVisible) {
        startMemoryPolling();
    } else {
        stopMemoryPolling();
    }
}

// --- FPS / Frame Time ---

const frameTimes: Float64Array = new Float64Array(BUFFER_SIZE);
let frameIdx = 0;
let frameCount = 0;
let prevTimestamp = 0;

// --- Network ---

let snapshotCounter = 0;
let snapshotWindowStart = performance.now();
let lastPayloadSize = 0;

// --- Public stats object (read by the overlay renderer) ---

export const debugStats = {
    // FPS
    fps: 0,
    fpsMin: 0,
    fpsMax: 0,
    frameTimeMs: 0,

    // Bodies
    totalBodies: 0,
    dynamicBodies: 0,
    staticBodies: 0,
    bodiesDrawn: 0,
    bodiesCulled: 0,

    // Network
    snapshotsPerSec: 0,
    lastSnapshotLatencyMs: 0,
    bytesPerSec: 0,

    // Render
    particlesActive: 0,

    // Phase
    phase: '',
    timerRemainingMs: 0,

    // Memory (Chrome only)
    jsHeapMB: 0,
    jsHeapLimitMB: 0,

    /** Call once per rAF frame with the rAF timestamp */
    updateFrame(nowMs: number): void {
        if (prevTimestamp > 0) {
            const dt = nowMs - prevTimestamp;
            debugStats.frameTimeMs = dt;
            frameTimes[frameIdx] = dt;
            frameIdx = (frameIdx + 1) % BUFFER_SIZE;
            frameCount++;

            // Recompute FPS stats every 30 frames (~0.5s)
            if (frameCount % 30 === 0) {
                const count = Math.min(frameCount, BUFFER_SIZE);
                let sum = 0, minDt = Infinity, maxDt = 0;
                for (let i = 0; i < count; i++) {
                    const v = frameTimes[i];
                    sum += v;
                    if (v < minDt) minDt = v;
                    if (v > maxDt) maxDt = v;
                }
                const avg = sum / count;
                debugStats.fps = avg > 0 ? 1000 / avg : 0;
                debugStats.fpsMin = maxDt > 0 ? 1000 / maxDt : 0; // worst frame → lowest FPS
                debugStats.fpsMax = minDt > 0 ? 1000 / minDt : 0; // best frame → highest FPS
            }
        }
        prevTimestamp = nowMs;
    },

    /** Call from the gameState socket handler to track network stats */
    recordSnapshot(serverTimestamp: number, payloadSample?: unknown): void {
        snapshotCounter++;
        debugStats.lastSnapshotLatencyMs = Date.now() - serverTimestamp;

        // Estimate payload size every 10th snapshot
        if (payloadSample && snapshotCounter % 10 === 0) {
            try {
                lastPayloadSize = JSON.stringify(payloadSample).length;
            } catch {
                // ignore
            }
        }

        // Compute snapshots/sec every second
        const elapsed = performance.now() - snapshotWindowStart;
        if (elapsed >= 1000) {
            debugStats.snapshotsPerSec = Math.round(snapshotCounter / (elapsed / 1000));
            debugStats.bytesPerSec = Math.round(debugStats.snapshotsPerSec * lastPayloadSize);
            snapshotCounter = 0;
            snapshotWindowStart = performance.now();
        }
    },
};

// --- Memory polling (Chrome only) ---

function startMemoryPolling(): void {
    if (memoryInterval) return;
    const perf = performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
    if (!perf.memory) return;
    memoryInterval = setInterval(() => {
        if (perf.memory) {
            debugStats.jsHeapMB = perf.memory.usedJSHeapSize / (1024 * 1024);
            debugStats.jsHeapLimitMB = perf.memory.jsHeapSizeLimit / (1024 * 1024);
        }
    }, 1000);
}

function stopMemoryPolling(): void {
    if (memoryInterval) {
        clearInterval(memoryInterval);
        memoryInterval = null;
    }
}

// Auto-start polling if ?debug=1 is in URL
if (debugVisible) {
    startMemoryPolling();
}
