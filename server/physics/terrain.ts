import Matter from 'matter-js';

// Simple 1D Perlin-like noise using sine harmonics (seeded)
function seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function noise1D(x: number, seed: number, octaves: number = 3): number {
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
        value += amplitude * Math.sin(x * frequency * 0.01 + phases[i]);
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
    width: 800,
    height: 600,
    resolution: 20,
    seed: 42,
    baseHeight: 520,      // Ground sits at ~520px from top
    amplitude: 80,        // ±80px variation
    octaves: 3
};

export interface TerrainResult {
    body: Matter.Body;
    points: { x: number; y: number }[];   // Surface points for client rendering
    buildZones: { x: number; width: number; y: number }[];  // Flat-ish areas
}

export function generateTerrain(config: Partial<TerrainConfig> = {}): TerrainResult {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const { width, height, resolution, seed, baseHeight, amplitude, octaves } = cfg;

    // Generate surface points
    const surfacePoints: { x: number; y: number }[] = [];
    for (let x = 0; x <= width; x += resolution) {
        const noiseVal = noise1D(x, seed, octaves);
        const y = baseHeight + noiseVal * amplitude;
        surfacePoints.push({ x, y });
    }

    // Ensure edges reach the full width
    if (surfacePoints[surfacePoints.length - 1].x < width) {
        const noiseVal = noise1D(width, seed, octaves);
        surfacePoints.push({ x: width, y: baseHeight + noiseVal * amplitude });
    }

    // Build vertices for a solid terrain body (surface + bottom corners)
    const vertices: { x: number; y: number }[] = [];

    // Bottom-left corner
    vertices.push({ x: 0, y: height + 50 });

    // Surface points (left to right)
    for (const pt of surfacePoints) {
        vertices.push({ x: pt.x, y: pt.y });
    }

    // Bottom-right corner
    vertices.push({ x: width, y: height + 50 });

    // Create the terrain body from vertices
    const centroid = Matter.Vertices.centre(vertices);
    const body = Matter.Bodies.fromVertices(centroid.x, centroid.y, [vertices], {
        isStatic: true,
        label: 'Terrain',
        friction: 0.8,
        render: {
            fillStyle: '#2a2a2a'
        }
    });

    // Identify build zones (areas where terrain is relatively flat)
    const buildZones = findBuildZones(surfacePoints, 15, 100);

    return { body, points: surfacePoints, buildZones };
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
                // Average Y across the zone
                let avgY = 0;
                let count = 0;
                for (let j = zoneStart; j < i; j++) {
                    avgY += points[j].y;
                    count++;
                }
                avgY /= count;

                zones.push({
                    x: points[zoneStart].x,
                    width: zoneWidth,
                    y: avgY
                });
            }
            zoneStart = i;
        }
    }

    // Check last zone
    const lastWidth = points[points.length - 1].x - points[zoneStart].x;
    if (lastWidth >= minWidth) {
        let avgY = 0;
        let count = 0;
        for (let j = zoneStart; j < points.length; j++) {
            avgY += points[j].y;
            count++;
        }
        avgY /= count;
        zones.push({
            x: points[zoneStart].x,
            width: lastWidth,
            y: avgY
        });
    }

    return zones;
}

export function getRandomSeed(): number {
    return Math.floor(Math.random() * 1000000);
}
