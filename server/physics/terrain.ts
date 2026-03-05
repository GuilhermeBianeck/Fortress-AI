import Matter from 'matter-js';

// Simple 1D Perlin-like noise using sine harmonics (seeded)
function seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function noise1D(x: number, seed: number, octaves: number = 3, freq: number = 0.01): number {
    const rng = seededRandom(seed);
    // Pre-generate phase offsets for each octave
    const phases: number[] = [];
    for (let i = 0; i < octaves; i++) {
        phases.push(rng() * Math.PI * 2);
    }

    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
        value += amplitude * Math.sin(x * frequency * freq + phases[i]);
        maxAmplitude += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }

    return value / maxAmplitude; // Normalize to [-1, 1]
}

export interface TerrainConfig {
    width: number;
    height: number;       // Canvas height
    resolution: number;   // Pixels between terrain sample points
    seed: number;
    baseHeight: number;   // Base ground Y position (from top)
    amplitude: number;    // Max terrain height variation
    octaves: number;
}

const DEFAULT_CONFIG: TerrainConfig = {
    width: 2400,
    height: 600,
    resolution: 20,
    seed: 42,
    baseHeight: 520,      // Ground sits at ~520px from top
    amplitude: 120,       // ±120px variation (Significant hills)
    octaves: 4
};

export interface TerrainResult {
    bodies: Matter.Body[];
    points: { x: number; y: number }[];   // Surface points for client rendering
    buildZones: { x: number; width: number; y: number }[];  // Flat-ish areas
}

export function generateTerrain(config: Partial<TerrainConfig> = {}): TerrainResult {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const { width, height, resolution, seed, baseHeight, amplitude, octaves } = cfg;

    // Generate surface points
    const surfacePoints: { x: number; y: number }[] = [];
    for (let x = 0; x <= width; x += resolution) {
        // Frequency 0.002 for defined but broad hills
        const noiseVal = noise1D(x, seed, octaves, 0.002);
        const y = baseHeight + noiseVal * amplitude;
        surfacePoints.push({ x, y });
    }

    // Ensure edges reach the full width
    if (surfacePoints[surfacePoints.length - 1].x < width) {
        const noiseVal = noise1D(width, seed, octaves, 0.002);
        surfacePoints.push({ x: width, y: baseHeight + noiseVal * amplitude });
    }

    // Identify build zones (tighter slope threshold: 5px ≈ 11°)
    const buildZones = findBuildZones(surfacePoints, 5, 100);

    // Flatten terrain points within build zones so they become true platforms
    // DISABLED: User requested natural terrain variation, not flat shelves.
    // flattenBuildZones(surfacePoints, buildZones);

    // Create convex trapezoid segments instead of one concave polygon
    const bodies = createTerrainSegments(surfacePoints, height + 50);

    return { bodies, points: surfacePoints, buildZones };
}

/**
 * Creates an array of convex trapezoid bodies from adjacent surface points.
 * Each trapezoid has the surface segment as its top edge and extends to bottomY.
 * Since each segment is a simple convex quad, no poly-decomp is needed
 * and adjacent segments share exact edge coordinates (no seam gaps).
 */
function createTerrainSegments(
    surfacePoints: { x: number; y: number }[],
    bottomY: number
): Matter.Body[] {
    const bodies: Matter.Body[] = [];

    for (let i = 0; i < surfacePoints.length - 1; i++) {
        const p1 = surfacePoints[i];
        const p2 = surfacePoints[i + 1];

        // Convex trapezoid: surface on top, flat bottom below canvas
        const vertices = [
            { x: p1.x, y: p1.y },   // top-left (surface)
            { x: p2.x, y: p2.y },   // top-right (surface)
            { x: p2.x, y: bottomY }, // bottom-right
            { x: p1.x, y: bottomY }, // bottom-left
        ];

        const cx = (p1.x + p2.x) / 2;
        const cy = (Math.min(p1.y, p2.y) + bottomY) / 2;

        const body = Matter.Bodies.fromVertices(cx, cy, [vertices], {
            isStatic: true,
            label: 'Terrain',
            friction: 2.0, // Increased friction to prevent sliding
            render: { fillStyle: '#2a2a2a' },
        });

        if (body) {
            bodies.push(body);
        }
    }

    return bodies;
}

interface BuildZone {
    x: number;
    width: number;
    y: number;
}

function findBuildZones(
    points: { x: number; y: number }[],
    maxSlope: number,      // Max Y difference between consecutive points
    minWidth: number       // Minimum zone width in pixels
): BuildZone[] {
    const zones: BuildZone[] = [];
    let zoneStart = 0;

    for (let i = 1; i < points.length; i++) {
        const slope = Math.abs(points[i].y - points[i - 1].y);
        if (slope > maxSlope) {
            // End current zone candidate
            const zoneWidth = points[i - 1].x - points[zoneStart].x;
            if (zoneWidth >= minWidth) {
                // Min Y (highest point) across the zone
                let zoneY = Infinity;
                for (let j = zoneStart; j < i; j++) {
                    zoneY = Math.min(zoneY, points[j].y);
                }

                zones.push({
                    x: points[zoneStart].x,
                    width: zoneWidth,
                    y: zoneY
                });
            }
            zoneStart = i;
        }
    }

    // Check last zone
    const lastWidth = points[points.length - 1].x - points[zoneStart].x;
    if (lastWidth >= minWidth) {
        let zoneY = Infinity;
        for (let j = zoneStart; j < points.length; j++) {
            zoneY = Math.min(zoneY, points[j].y);
        }
        zones.push({
            x: points[zoneStart].x,
            width: lastWidth,
            y: zoneY
        });
    }

    return zones;
}

export function getRandomSeed(): number {
    return Math.floor(Math.random() * 1000000);
}
