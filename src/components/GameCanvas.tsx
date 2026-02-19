import { useEffect, useRef, useCallback } from 'react';
import type { GameState, TerrainData, GameMode, Vector, Side, MatchPhase, KingHpState } from '../types';
import { WORLD_WIDTH, CANVAS_WIDTH, CANVAS_HEIGHT, LEFT_CANNON_X, RIGHT_CANNON_X } from '../types';
import { ParticleSystem } from '../effects/particles';

interface GameCanvasProps {
    gameState: GameState | null;
    terrain: TerrainData | null;
    onSpawn: (x: number, y: number) => void;
    kingsHp: { left: KingHpState; right: KingHpState };
    mySide: Side;
    gameMode: GameMode;
    phase: MatchPhase;
    turnPlayer: Side | null;
    onFire: (angle: number, power: number) => void;
    setBlockDestroyedCallback: (cb: ((data: { bodyId: number; position: Vector; material: string; velocity: Vector }) => void) | null) => void;
    setProjectileImpactCallback: (cb: ((data: { position: Vector }) => void) | null) => void;
    playerNames?: { left: string; right: string };
    hazards?: HazardData[];
    roundScore?: { left: number; right: number };
    currentRound?: number;
}

export interface HazardData {
    type: string;
    id: string;
    position: { x: number; y: number };
    width: number;
    height: number;
    windDirection?: number;
    windStrength?: number;
}

// Material color map (dark medieval theme)
const MATERIAL_COLORS: Record<string, string> = {
    wood: '#8B6B42',
    stone: '#5A5A6A',
    ice: '#7EC8D0',
    rubber: '#D45090',
    steel: '#4A5560',
    king: '#FFD700',
    Terrain: '#2a4a2f',
};

const MATERIAL_STROKE: Record<string, string> = {
    wood: '#6B4D14',
    stone: '#3a3a4a',
    ice: '#5AA8B0',
    rubber: '#A03868',
    steel: '#1e2226',
    king: '#B8860B',
};

function getHpColor(ratio: number): string {
    if (ratio > 0.6) return '#22c55e';
    if (ratio > 0.3) return '#eab308';
    return '#ef4444';
}

function interpolateTerrainY(points: { x: number; y: number }[], x: number): number {
    for (let i = 0; i < points.length - 1; i++) {
        if (points[i].x <= x && points[i + 1].x >= x) {
            const t = (x - points[i].x) / (points[i + 1].x - points[i].x);
            return points[i].y + t * (points[i + 1].y - points[i].y);
        }
    }
    return points[points.length - 1]?.y ?? 500;
}

export const GameCanvas = ({
    gameState, terrain, onSpawn, kingsHp, mySide,
    gameMode, phase, turnPlayer, onFire,
    setBlockDestroyedCallback, setProjectileImpactCallback,
    playerNames, hazards, roundScore, currentRound,
}: GameCanvasProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Persistent state in refs (no re-render thrashing)
    const gameStateRef = useRef(gameState);
    const terrainRef = useRef(terrain);
    const kingsHpRef = useRef(kingsHp);
    const mySideRef = useRef(mySide);
    const gameModeRef = useRef(gameMode);
    const phaseRef = useRef(phase);
    const turnPlayerRef = useRef(turnPlayer);
    const onSpawnRef = useRef(onSpawn);
    const onFireRef = useRef(onFire);
    const playerNamesRef = useRef(playerNames);
    const hazardsRef = useRef(hazards);
    const roundScoreRef = useRef(roundScore);
    const currentRoundRef = useRef(currentRound);

    // Camera state
    const cameraRef = useRef({ x: 0, targetX: 0 });

    // Aim state
    const aimRef = useRef<{ active: boolean; angle: number; power: number; useKeyboard: boolean }>({
        active: false, angle: Math.PI / 4, power: 15, useKeyboard: false,
    });

    // Touch guard — prevent synthesized mouse events after touch
    const lastTouchRef = useRef(0);
    // Touch aiming: store initial touch screen position for drag-relative power
    const touchStartRef = useRef<{ sx: number; sy: number } | null>(null);
    // Two-finger pan: store initial midpoint and camera position
    const panTouchRef = useRef<{ startX: number; camStartX: number } | null>(null);

    // Screen shake
    const shakeRef = useRef({ amplitude: 0, remaining: 0, max: 0 });

    // Particles
    const particlesRef = useRef(new ParticleSystem());

    // Cloud state
    interface Cloud {
        x: number;
        y: number;
        speed: number;
        scale: number;
        depth: number; // 0=far, 1=near
        puffs: { dx: number; dy: number; rx: number; ry: number }[];
    }
    const cloudsRef = useRef<Cloud[] | null>(null);

    // Projectile trails: bodyId -> last N positions
    const trailsRef = useRef<Map<number, Vector[]>>(new Map());

    // Previous kings HP for shake detection
    const prevKingsHpRef = useRef(kingsHp);

    // Animation frame ID
    const rafRef = useRef<number>(0);

    // Keys pressed for camera
    const keysRef = useRef<Set<string>>(new Set());

    // Sync refs
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
    useEffect(() => { terrainRef.current = terrain; }, [terrain]);
    useEffect(() => { kingsHpRef.current = kingsHp; }, [kingsHp]);
    useEffect(() => { mySideRef.current = mySide; }, [mySide]);
    useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);
    useEffect(() => { phaseRef.current = phase; }, [phase]);
    useEffect(() => { turnPlayerRef.current = turnPlayer; }, [turnPlayer]);
    useEffect(() => { onSpawnRef.current = onSpawn; }, [onSpawn]);
    useEffect(() => { onFireRef.current = onFire; }, [onFire]);
    useEffect(() => { playerNamesRef.current = playerNames; }, [playerNames]);
    useEffect(() => { hazardsRef.current = hazards; }, [hazards]);
    useEffect(() => { roundScoreRef.current = roundScore; }, [roundScore]);
    useEffect(() => { currentRoundRef.current = currentRound; }, [currentRound]);

    // Set initial camera to own side
    useEffect(() => {
        if (mySide === 'right') {
            cameraRef.current.x = WORLD_WIDTH - CANVAS_WIDTH;
            cameraRef.current.targetX = WORLD_WIDTH - CANVAS_WIDTH;
        } else {
            cameraRef.current.x = 0;
            cameraRef.current.targetX = 0;
        }
    }, [mySide]);

    // Detect King HP decrease -> shake
    useEffect(() => {
        const myKingHp = kingsHp[mySide].hp;
        const prevMyKingHp = prevKingsHpRef.current[mySide].hp;
        if (myKingHp < prevMyKingHp) {
            triggerShake(6, 18);
        }
        prevKingsHpRef.current = kingsHp;
    }, [kingsHp, mySide]);

    const triggerShake = useCallback((amplitude: number, duration: number) => {
        const s = shakeRef.current;
        if (amplitude > s.amplitude || s.remaining <= 0) {
            s.amplitude = amplitude;
            s.remaining = duration;
            s.max = duration;
        }
    }, []);

    // Register socket callbacks
    useEffect(() => {
        setBlockDestroyedCallback((data) => {
            const color = MATERIAL_COLORS[data.material] || '#888';
            particlesRef.current.emit(data.position.x, data.position.y, 10, color, data.velocity);
            triggerShake(2, 8);
        });
        setProjectileImpactCallback((data) => {
            particlesRef.current.emit(data.position.x, data.position.y, 6, '#888');
        });
        return () => {
            setBlockDestroyedCallback(null);
            setProjectileImpactCallback(null);
        };
    }, [setBlockDestroyedCallback, setProjectileImpactCallback, triggerShake]);

    // Update projectile trails from gameState
    useEffect(() => {
        if (!gameState) return;
        const trails = trailsRef.current;
        const activeIds = new Set<number>();

        for (const body of gameState.bodies) {
            if (body.label !== 'projectile') continue;
            activeIds.add(body.id);
            let trail = trails.get(body.id);
            if (!trail) {
                trail = [];
                trails.set(body.id, trail);
            }
            trail.push({ x: body.position.x, y: body.position.y });
            if (trail.length > 5) trail.shift();
        }

        // Cleanup stale trails
        for (const id of trails.keys()) {
            if (!activeIds.has(id)) trails.delete(id);
        }
    }, [gameState]);

    // Auto-pan camera based on phase
    useEffect(() => {
        const cam = cameraRef.current;
        if (phase === 'build') {
            // Pan to own side during build
            cam.targetX = mySide === 'left' ? 0 : WORLD_WIDTH - CANVAS_WIDTH;
        } else if (phase === 'reveal') {
            // Auto-pan from left to right during reveal
            cam.targetX = 0;
            const panTimer = setTimeout(() => {
                cam.targetX = WORLD_WIDTH - CANVAS_WIDTH;
            }, 2500);
            return () => clearTimeout(panTimer);
        }
    }, [phase, mySide]);

    // Auto-pan to own cannon when it's my turn
    useEffect(() => {
        if (phase !== 'combat') return;
        if (turnPlayer === mySide) {
            const cannonX = mySide === 'left' ? LEFT_CANNON_X : RIGHT_CANNON_X;
            cameraRef.current.targetX = Math.max(0, Math.min(
                WORLD_WIDTH - CANVAS_WIDTH,
                cannonX - CANVAS_WIDTH / 2
            ));
        }
    }, [phase, turnPlayer, mySide]);

    // Track projectile during combat for auto-pan
    useEffect(() => {
        if (phase !== 'combat' || !gameState) return;
        const projectile = gameState.bodies.find(b => b.label === 'projectile');
        if (projectile) {
            cameraRef.current.targetX = Math.max(0, Math.min(
                WORLD_WIDTH - CANVAS_WIDTH,
                projectile.position.x - CANVAS_WIDTH / 2
            ));
        }
    }, [phase, gameState]);

    // 60fps render loop
    useEffect(() => {
        console.log('GameCanvas: useEffect mount - starting render loop');
        const render = () => {
            renderFrame();
            rafRef.current = requestAnimationFrame(render);
        };
        rafRef.current = requestAnimationFrame(render);
        return () => {
            console.log('GameCanvas: useEffect unmount - stopping render loop');
            cancelAnimationFrame(rafRef.current);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const debugLogRef = useRef(false);

    const renderFrame = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const gs = gameStateRef.current;
        const terr = terrainRef.current;
        const cam = cameraRef.current;

        if (!debugLogRef.current) {
            console.log('renderFrame: first run', {
                hasTerrain: !!terr,
                points: terr?.points?.length,
                camX: cam.x,
                camTargetX: cam.targetX,
                canvasWidth: canvas.width,
                canvasHeight: canvas.height,
                firstPoint: terr?.points?.[0],
                lastPoint: terr?.points?.[terr.points.length - 1]
            });
            debugLogRef.current = true;
        }
        const kings = kingsHpRef.current;
        const side = mySideRef.current;
        const currentPhase = phaseRef.current;
        const currentTurn = turnPlayerRef.current;
        const aim = aimRef.current;
        const shake = shakeRef.current;
        const particles = particlesRef.current;
        // const cam = cameraRef.current; // Already declared above



        // Update camera with smooth lerp
        const keys = keysRef.current;
        if (keys.has('a') || keys.has('A')) cam.targetX -= 8;
        if (keys.has('d') || keys.has('D')) cam.targetX += 8;
        cam.targetX = Math.max(0, Math.min(WORLD_WIDTH - CANVAS_WIDTH, cam.targetX));
        cam.x += (cam.targetX - cam.x) * 0.1;

        // Update particles
        particles.update();

        ctx.save();

        // Apply screen shake
        if (shake.remaining > 0) {
            const progress = shake.remaining / shake.max;
            const amp = shake.amplitude * progress;
            const sx = (Math.random() - 0.5) * 2 * amp;
            const sy = (Math.random() - 0.5) * 2 * amp;
            ctx.translate(sx, sy);
            shake.remaining--;
        }

        // Dark twilight sky gradient
        const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGrad.addColorStop(0, '#0a0a14');
        bgGrad.addColorStop(0.2, '#0d0d1a');
        bgGrad.addColorStop(0.45, '#141428');
        bgGrad.addColorStop(0.7, '#1a1a3e');
        bgGrad.addColorStop(0.88, '#2a1a1a');
        bgGrad.addColorStop(1, '#1a1008');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(-10, -10, canvas.width + 20, canvas.height + 20);

        // Twinkling stars (upper sky only)
        const starSeed = 42;
        const starTime = Date.now() / 1000;
        for (let i = 0; i < 60; i++) {
            const sx = ((i * 137.508 + starSeed * 73) % (canvas.width + 200)) - 100;
            const sy = ((i * 97.3 + starSeed * 31) % (canvas.height * 0.55));
            const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(starTime * (0.5 + (i % 5) * 0.3) + i * 1.7));
            const size = 0.5 + (i % 3) * 0.5;
            ctx.beginPath();
            ctx.arc(sx, sy, size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200, 210, 255, ${(twinkle * 0.6).toFixed(2)})`;
            ctx.fill();
        }

        // Subtle horizon glow
        const horizonGlow = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.85, 0, canvas.width / 2, canvas.height * 0.85, canvas.width * 0.6);
        horizonGlow.addColorStop(0, 'rgba(180, 100, 30, 0.08)');
        horizonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = horizonGlow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Initialize dark storm clouds
        if (!cloudsRef.current) {
            const generateCloud = (layer: 'far' | 'mid' | 'near') => {
                const depth = layer === 'far' ? 0.2 : layer === 'mid' ? 0.5 : 0.8;
                const baseScale = layer === 'far' ? 0.7 : layer === 'mid' ? 1.1 : 1.6;
                const speed = layer === 'far' ? 0.08 : layer === 'mid' ? 0.15 : 0.25;

                return {
                    x: Math.random() * (WORLD_WIDTH * 1.5),
                    y: (Math.random() * 120) + (layer === 'far' ? 10 : layer === 'mid' ? 40 : 70),
                    speed: speed + Math.random() * 0.08,
                    scale: baseScale * (0.8 + Math.random() * 0.4),
                    depth,
                    puffs: Array.from({ length: 4 + Math.floor(Math.random() * 4) }, () => ({
                        dx: (Math.random() - 0.5) * 80,
                        dy: (Math.random() * 20),
                        rx: 30 + Math.random() * 20,
                        ry: 15 + Math.random() * 15
                    }))
                };
            };

            const clouds: Cloud[] = [];
            for (let i = 0; i < 10; i++) clouds.push(generateCloud('far'));
            for (let i = 0; i < 7; i++) clouds.push(generateCloud('mid'));
            for (let i = 0; i < 5; i++) clouds.push(generateCloud('near'));

            cloudsRef.current = clouds;
        }

        // Draw Background Parallax (Mountains/Hills)
        const drawLayer = (color: string, height: number, parallaxFactor: number, seedOffset: number, verticalOffset: number, frequency: number) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            const startX = -100;
            const endX = canvas.width + 100;
            const camX = cam.x * parallaxFactor;
            // Use terrain seed if available, otherwise 0
            const baseSeed = terr?.seed ?? 0;
            const amplitude = 120; // Fixed amplitude for background layers

            ctx.moveTo(startX, canvas.height);
            for (let x = startX; x <= endX; x += 20) {
                // Perlin-ish noise using sine waves with custom seed offset
                const worldX = x + camX;
                const layerSeed = baseSeed + seedOffset;
                const noise = Math.sin(worldX * frequency + layerSeed) * amplitude
                    + Math.sin(worldX * frequency * 2.5 + layerSeed * 1.5) * (amplitude * 0.5)
                    + Math.sin(worldX * frequency * 5 + layerSeed * 2.2) * (amplitude * 0.25);
                // Height = base height from bottom
                // VerticalOffset = additional shift (likely downwards if positive, or just an offset)
                // User call: drawLayer('#A0BEDC', 250, 0.05, 123, 100, 0.002);

                const y = canvas.height - height + noise + verticalOffset;

                ctx.lineTo(x, y);
            }
            ctx.lineTo(endX, canvas.height);
            ctx.fill();
        };

        // Layer 1: Far Mountains — dark misty silhouettes
        drawLayer('#1a1e2e', 250, 0.05, 123, 100, 0.002);

        // Layer 2: Mid Hills — dark forest silhouettes
        drawLayer('#141e18', 150, 0.15, 456, 60, 0.005);

        // Layer 3: Near Hills — darkest foreground
        drawLayer('#0e1610', 80, 0.3, 789, 40, 0.008);


        // Update and draw clouds (sorted by depth for correct occlusion if they overlap, though purely additive here)
        const clouds = cloudsRef.current;
        // Optimization: Don't sort every frame, they maintain relative depth usually. 
        // Just draw them.

        for (const cloud of clouds) {
            // Move cloud
            cloud.x -= cloud.speed;

            // Wrap logic: needs to wrap based on WORLD_WIDTH effectively
            const totalWidth = WORLD_WIDTH + 800;
            if (cloud.x < -400) cloud.x += totalWidth;

            // Parallax offset computation
            // "depth" defines how much it *follows* the camera.
            // 0 depth = grounded (moves 1:1 with camera, effectively staying in world spot).
            // 1 depth = HUD (moves 1:1 with camera view, effectively static on screen).
            // Actually, usually parallax factor < 1 means it moves slower.
            // Screen X = (World X - Camera X * ParallaxFactor)

            const parallaxFactor = cloud.depth; // 0.2 (far), 0.5 (mid), 0.8 (near)
            // Wait, standard parallax:
            // Far objects move slower. So if cam moves 100px right, far object moves 20px left on screen.
            // Near objects move faster.

            // Let's use standard factor:
            // far (0.2) -> cam moves 100, cloud shifts 20 on screen (looks far).
            // near (0.8) -> cam moves 100, cloud shifts 80 on screen (looks closer).

            // We need to handle wrapping relative to the camera view to avoid popping.
            // Simple approach: Render at screen coords.

            const screenX = cloud.x - (cam.x * parallaxFactor);

            // Handle visible wrapping for infinite scroll effect on screen?
            // Since world is finite (WORLD_WIDTH), but clouds drift...
            // Let's just draw them where they are.

            // Wrap the *screen* position to keep them around? 
            // Better: Keep world position wrapping, just apply parallax.
            // If explicit wrapping is needed for infinite background feel:
            // const modX = ((cloud.x - cam.x * parallaxFactor) % (canvas.width + 500));
            // simplified:

            let drawX = screenX;
            // Provide localized wrapping if it goes too far off screen?
            // For a fixed world size, standard parallax is fine.

            const drawY = cloud.y;

            // Check visibility
            if (drawX > -300 && drawX < canvas.width + 300) {
                // Dark storm-grey clouds with slight purple tint
                const cloudAlpha = 0.25 + cloud.depth * 0.15;
                ctx.fillStyle = `rgba(35, 30, 50, ${cloudAlpha.toFixed(2)})`;

                for (const puff of cloud.puffs) {
                    const px = drawX + puff.dx * cloud.scale;
                    const py = drawY + puff.dy * cloud.scale;
                    const rx = puff.rx * cloud.scale;
                    const ry = puff.ry * cloud.scale;

                    ctx.beginPath();
                    ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
                    ctx.fill();

                    // Flat bottom effect (subtle cut)
                    // const cutY = py + ry * 0.4;
                    // ctx.fillRect(px - rx, cutY, rx * 2, ry); 
                    // (Actually ellipse looks fine for cumulus if aspect ratio is right)
                }

                // Draw a flat bottom to make it look like a cumulus cloud
                ctx.beginPath();
                const bottomY = drawY + 15 * cloud.scale;
                const width = 100 * cloud.scale;
                // Gradient fade for bottom?
                // Simple rect approximation for base
                // ctx.roundRect(drawX - width/2, bottomY - 10, width, 20, 10);
                // ctx.fill();
            }
        }

        // === Apply camera offset for world drawing ===
        ctx.save();
        ctx.translate(-cam.x, 0);

        // Draw terrain
        if (terr && terr.points.length > 0) {
            ctx.beginPath();
            ctx.moveTo(0, canvas.height);
            for (const pt of terr.points) {
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.lineTo(WORLD_WIDTH, canvas.height);
            ctx.closePath();

            // Dark earth terrain gradient
            const terrainGrad = ctx.createLinearGradient(0, 400, 0, canvas.height);
            terrainGrad.addColorStop(0, '#2a3a20');
            terrainGrad.addColorStop(0.15, '#1e2a18');
            terrainGrad.addColorStop(0.4, '#1e1510');
            terrainGrad.addColorStop(1, '#0e0a08');
            ctx.fillStyle = terrainGrad;
            ctx.fill();

            // Gold-tinted terrain edge
            ctx.beginPath();
            ctx.moveTo(terr.points[0].x, terr.points[0].y);
            for (let i = 1; i < terr.points.length; i++) {
                ctx.lineTo(terr.points[i].x, terr.points[i].y);
            }
            ctx.strokeStyle = 'rgba(180, 150, 80, 0.25)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Build zone overlays (gold-tinted)
            for (const zone of terr.buildZones) {
                ctx.fillStyle = 'rgba(255, 215, 0, 0.04)';
                ctx.fillRect(zone.x, zone.y - 100, zone.width, 100);
                ctx.strokeStyle = 'rgba(255, 215, 0, 0.12)';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(zone.x, zone.y - 2);
                ctx.lineTo(zone.x + zone.width, zone.y - 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Center divider — subtle gold dashed line
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.12)';
            ctx.lineWidth = 1;
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.moveTo(WORLD_WIDTH / 2, 0);
            ctx.lineTo(WORLD_WIDTH / 2, canvas.height);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw hazard zones
        const hzds = hazardsRef.current;
        if (hzds) {
            const animPhase = Date.now() / 1000;
            for (const h of hzds) {
                if (h.type === 'wind_zone') {
                    // Subtle blue tint
                    ctx.fillStyle = 'rgba(100, 150, 255, 0.03)';
                    ctx.fillRect(h.position.x, h.position.y, h.width, h.height);

                    // Organic wind particles — curved streaks with wobble
                    const dir = h.windDirection ?? 1;
                    const visibleLeft = cam.x - 100;
                    const visibleRight = cam.x + CANVAS_WIDTH + 100;
                    const particleCount = 50;
                    const wrapWidth = visibleRight - visibleLeft + 200;

                    for (let i = 0; i < particleCount; i++) {
                        const seed = i * 137.508;
                        // Horizontal position wraps across the visible area
                        const rawX = visibleLeft + ((seed + animPhase * (50 + (i % 4) * 15) * dir) % wrapWidth + wrapWidth) % wrapWidth;
                        // Vertical position distributed across height with some jitter
                        const baseY = h.position.y + ((seed * 73.7) % h.height);
                        // Wobble for organic movement
                        const wobble = Math.sin(animPhase * (1.5 + (i % 3) * 0.5) + seed * 0.1) * 6;
                        const wobble2 = Math.cos(animPhase * 0.8 + seed * 0.07) * 3;
                        // Varying streak length
                        const len = 12 + (i % 7) * 6;
                        // Pulsing opacity
                        const alpha = 0.08 + 0.12 * Math.sin(animPhase * (2 + (i % 5) * 0.3) + seed * 0.15);

                        const x = rawX;
                        const y = baseY + wobble;

                        // Draw curved streak
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        ctx.quadraticCurveTo(
                            x + dir * len * 0.4, y + wobble2 - 2,
                            x + dir * len, y + wobble2
                        );
                        ctx.strokeStyle = `rgba(180, 215, 255, ${alpha.toFixed(3)})`;
                        ctx.lineWidth = 0.8 + (i % 3) * 0.4;
                        ctx.stroke();

                        // Small arrowhead on some streaks
                        if (i % 4 === 0) {
                            const tipX = x + dir * len;
                            const tipY = y + wobble2;
                            ctx.beginPath();
                            ctx.moveTo(tipX, tipY);
                            ctx.lineTo(tipX - dir * 4, tipY - 2);
                            ctx.moveTo(tipX, tipY);
                            ctx.lineTo(tipX - dir * 4, tipY + 2);
                            ctx.strokeStyle = `rgba(180, 215, 255, ${(alpha * 0.7).toFixed(3)})`;
                            ctx.lineWidth = 0.6;
                            ctx.stroke();
                        }
                    }
                } else if (h.type === 'lava_pool') {
                    // Glowing orange/red
                    const glow = 0.4 + 0.1 * Math.sin(animPhase * 3);
                    ctx.fillStyle = `rgba(255, 80, 20, ${glow})`;
                    ctx.fillRect(h.position.x, h.position.y, h.width, h.height);
                    ctx.fillStyle = `rgba(255, 200, 50, ${glow * 0.5})`;
                    ctx.fillRect(h.position.x + 2, h.position.y + 2, h.width - 4, h.height - 4);
                } else if (h.type === 'falling_rocks') {
                    // Dashed danger column
                    ctx.strokeStyle = 'rgba(255, 200, 50, 0.3)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 6]);
                    ctx.strokeRect(h.position.x, h.position.y, h.width, h.height);
                    ctx.setLineDash([]);

                    // Danger label
                    ctx.font = 'bold 9px monospace';
                    ctx.fillStyle = 'rgba(255, 200, 50, 0.5)';
                    ctx.textAlign = 'center';
                    ctx.fillText('DANGER', h.position.x + h.width / 2, h.position.y + 15);
                }
            }
        }

        // Draw BOTH cannons
        if (terr && terr.points.length > 0) {
            const drawCannon = (cannonX: number, facingRight: boolean, isActive: boolean) => {
                const cannonY = interpolateTerrainY(terr.points, cannonX) - 20;
                const currentAngle = isActive ? aim.angle : Math.PI / 4;

                // Barrel — dark iron with gold accent
                ctx.save();
                ctx.translate(cannonX, cannonY);
                const barrelAngle = facingRight ? -currentAngle : -(Math.PI - currentAngle);
                ctx.rotate(barrelAngle);
                ctx.fillStyle = isActive ? '#3a3a4a' : '#2a2a3a';
                ctx.fillRect(0, -4, 24, 8);
                ctx.strokeStyle = isActive ? '#aa9055' : '#4a4a5a';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(0, -4, 24, 8);
                // Gold rivet at muzzle
                if (isActive) {
                    ctx.beginPath();
                    ctx.arc(22, 0, 1.5, 0, Math.PI * 2);
                    ctx.fillStyle = '#FFD700';
                    ctx.fill();
                }
                ctx.restore();

                // Base — dark iron wheel
                ctx.beginPath();
                ctx.arc(cannonX, cannonY, 7, 0, Math.PI * 2);
                ctx.fillStyle = isActive ? '#3a3a4a' : '#2a2a3a';
                ctx.fill();
                ctx.strokeStyle = isActive ? '#aa9055' : '#4a4a5a';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                // Gold center dot
                ctx.beginPath();
                ctx.arc(cannonX, cannonY, 2, 0, Math.PI * 2);
                ctx.fillStyle = isActive ? '#FFD700' : '#6a6a7a';
                ctx.fill();

                // Trajectory preview (only for active cannon during fire mode)
                if (isActive && (aim.active || aim.useKeyboard) && currentPhase === 'combat') {
                    // Match server physics: gravity.y=2, gravity.scale=0.001, delta=1000/60
                    // gravityAccel = gravity.y * gravity.scale * delta^2 = 2 * 0.001 * (1000/60)^2 ≈ 0.556
                    const gravityAccel = 0.556;
                    const airDamp = 0.995; // matches server frictionAir=0.005
                    const maxSpeed = 35;

                    const dirMult = facingRight ? 1 : -1;
                    let px = cannonX + dirMult * Math.cos(currentAngle) * 24;
                    let py = cannonY - Math.sin(currentAngle) * 24;
                    let vx = dirMult * aim.power * Math.cos(currentAngle);
                    let vy = -aim.power * Math.sin(currentAngle);

                    // Apply speed cap (same as server)
                    const speed = Math.sqrt(vx * vx + vy * vy);
                    if (speed > maxSpeed) {
                        const s = maxSpeed / speed;
                        vx *= s;
                        vy *= s;
                    }

                    // Short guide — shows direction only, not the full arc
                    const steps = 25;
                    for (let step = 0; step < steps; step++) {
                        vx *= airDamp;
                        vy *= airDamp;
                        px += vx;
                        py += vy;
                        vy += gravityAccel;

                        // Fast fade — disappears well before reaching target
                        const alpha = 0.5 * (1 - step / steps) * (1 - step / steps);
                        if (alpha < 0.03) break;

                        // Draw every other dot for a dashed look
                        if (step % 2 === 0) {
                            ctx.beginPath();
                            ctx.arc(px, py, 1.5, 0, Math.PI * 2);
                            // Gold dots for dark sky visibility
                            ctx.fillStyle = `rgba(255, 215, 0, ${Math.min(0.9, alpha + 0.3).toFixed(2)})`;
                            ctx.fill();
                        }

                        if (py > CANVAS_HEIGHT + 50 || px < -50 || px > WORLD_WIDTH + 50) break;
                    }
                }

                // Aim readout (always show when aiming)
                if (isActive && (aim.active || aim.useKeyboard) && currentPhase === 'combat') {
                    ctx.font = 'bold 10px monospace';
                    ctx.fillStyle = '#FFD700';
                    ctx.textAlign = 'left';
                    const labelX = facingRight ? cannonX + 14 : cannonX - 90;
                    ctx.fillText(`${(currentAngle * 180 / Math.PI).toFixed(0)}° P:${aim.power.toFixed(0)}`, labelX, cannonY - 18);

                    // Power bar
                    const barX = facingRight ? cannonX + 14 : cannonX - 90;
                    const barY = cannonY - 8;
                    const barW = 60;
                    const barH = 5;
                    const powerRatio = (aim.power - 5) / 45;
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                    ctx.fillRect(barX, barY, barW, barH);
                    const r = Math.round(255 * powerRatio);
                    const g = Math.round(255 * (1 - powerRatio));
                    ctx.fillStyle = `rgb(${r}, ${g}, 80)`;
                    ctx.fillRect(barX, barY, barW * powerRatio, barH);
                    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(barX, barY, barW, barH);
                }
            };

            // Left cannon (fires right)
            const leftActive = currentPhase === 'combat' && currentTurn === 'left' && side === 'left';
            drawCannon(LEFT_CANNON_X, true, leftActive);

            // Right cannon (fires left)
            const rightActive = currentPhase === 'combat' && currentTurn === 'right' && side === 'right';
            drawCannon(RIGHT_CANNON_X, false, rightActive);
        }

        // Draw projectile trails
        const trails = trailsRef.current;
        for (const [, positions] of trails) {
            for (let i = 0; i < positions.length - 1; i++) {
                const alpha = (i + 1) / positions.length * 0.5;
                ctx.beginPath();
                ctx.arc(positions[i].x, positions[i].y, 3, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 180, 80, ${alpha})`;
                ctx.fill();
            }
        }

        // Draw dynamic bodies
        if (gs) {
            for (const body of gs.bodies) {
                if (body.label === 'Terrain' || body.label === 'Boundary') continue;

                ctx.save();
                ctx.translate(body.position.x, body.position.y);
                ctx.rotate(body.angle);

                const fillColor = body.color || MATERIAL_COLORS[body.material] || MATERIAL_COLORS[body.label] || '#e11d48';
                const strokeColor = MATERIAL_STROKE[body.material] || MATERIAL_STROKE[body.label] || 'rgba(255,255,255,0.3)';

                if (body.circleRadius > 0) {
                    if (body.label === 'king') {
                        // King: golden glow instead of drop shadow
                        ctx.shadowColor = 'rgba(255, 215, 0, 0.4)';
                        ctx.shadowBlur = 8;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                    } else {
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                        ctx.shadowBlur = 6;
                        ctx.shadowOffsetX = 2;
                        ctx.shadowOffsetY = 2;
                    }

                    ctx.beginPath();
                    ctx.arc(0, 0, body.circleRadius, 0, Math.PI * 2);
                    ctx.fillStyle = fillColor;
                    ctx.fill();
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    if (body.label === 'king') {
                        ctx.font = '10px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillStyle = '#FFD700';
                        ctx.fillText('\u265A', 0, 4);
                    }

                    // Projectile glow
                    if (body.label === 'projectile') {
                        ctx.beginPath();
                        ctx.arc(0, 0, body.circleRadius + 4, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(255, 180, 50, 0.25)';
                        ctx.fill();
                    }
                } else if (!body.isStatic || body.label === 'foundation') {
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                    ctx.shadowBlur = 6;
                    ctx.shadowOffsetX = 2;
                    ctx.shadowOffsetY = 2;
                    const w = body.width || 50;
                    const h = body.height || 50;
                    ctx.fillStyle = fillColor;
                    ctx.fillRect(-w / 2, -h / 2, w, h);
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(-w / 2, -h / 2, w, h);

                    // Inner highlight — warm gold tint
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.06)';
                    ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h / 3);

                    // Block damage visuals (cracks + desaturation)
                    if (body.blockHp != null && body.blockMaxHp != null && body.blockMaxHp > 0) {
                        const hpRatio = body.blockHp / body.blockMaxHp;
                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;

                        if (hpRatio <= 0.66) {
                            // Draw cracks
                            ctx.strokeStyle = 'rgba(30, 30, 30, 0.6)';
                            ctx.lineWidth = 1;
                            const seed = body.id % 7;
                            const crackCount = hpRatio <= 0.33 ? 5 + seed % 3 : 2 + seed % 2;

                            for (let c = 0; c < crackCount; c++) {
                                const cx1 = ((c * 31 + seed * 13) % (w | 1)) - w / 2;
                                const cy1 = ((c * 17 + seed * 7) % (h | 1)) - h / 2;
                                const cx2 = cx1 + ((c % 2 === 0 ? 1 : -1) * (5 + (c * 3 + seed) % 10));
                                const cy2 = cy1 + ((c % 2 === 0 ? -1 : 1) * (3 + (c * 5 + seed) % 8));
                                ctx.beginPath();
                                ctx.moveTo(cx1, cy1);
                                ctx.lineTo(cx2, cy2);
                                ctx.stroke();
                            }
                        }

                        if (hpRatio <= 0.33) {
                            // Desaturation overlay
                            ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
                            ctx.fillRect(-w / 2, -h / 2, w, h);
                        }
                    }
                }

                ctx.restore();

                // Floating HP bar above King
                if (body.label === 'king') {
                    // Determine which king this is based on position
                    const kingSide: Side = body.position.x < WORLD_WIDTH / 2 ? 'left' : 'right';
                    const kHp = kings[kingSide].hp;
                    const kMaxHp = kings[kingSide].maxHp;
                    if (kMaxHp > 0) {
                        const barWidth = 30;
                        const barHeight = 4;
                        const barX = body.position.x - barWidth / 2;
                        const barY = body.position.y - (body.circleRadius || 12) - 10;
                        const hpRatio = Math.max(0, kHp / kMaxHp);

                        ctx.fillStyle = 'rgba(10, 10, 18, 0.7)';
                        ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
                        ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
                        ctx.lineWidth = 0.5;
                        ctx.strokeRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
                        ctx.fillStyle = '#1a1a2e';
                        ctx.fillRect(barX, barY, barWidth, barHeight);
                        ctx.fillStyle = getHpColor(hpRatio);
                        ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
                    }
                }

                // Block HP bar (only show if damaged)
                if (body.blockHp != null && body.blockMaxHp != null && body.blockMaxHp > 0 && body.blockHp < body.blockMaxHp) {
                    const barWidth = Math.min(body.width || 30, 30);
                    const barHeight = 3;
                    const barX = body.position.x - barWidth / 2;
                    const barY = body.position.y - (body.height || 30) / 2 - 6;
                    const hpRatio = Math.max(0, body.blockHp / body.blockMaxHp);

                    ctx.fillStyle = 'rgba(10, 10, 18, 0.6)';
                    ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
                    ctx.fillStyle = '#1a1a2e';
                    ctx.fillRect(barX, barY, barWidth, barHeight);
                    ctx.fillStyle = getHpColor(hpRatio);
                    ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
                }
            }
        }

        // Draw particles (in world space)
        particles.draw(ctx);

        // === End world drawing ===
        ctx.restore();

        // === HUD (fixed to screen, not affected by camera) ===

        // Left King HP bar (top-left)
        const names = playerNamesRef.current;
        const leftLabel = names?.left || (side === 'left' ? 'YOU' : 'ENEMY');
        const rightLabel = names?.right || (side === 'right' ? 'YOU' : 'ENEMY');
        drawKingHud(ctx, 12, 12, kings.left, leftLabel);

        // Right King HP bar (top-right)
        drawKingHud(ctx, canvas.width - 132, 12, kings.right, rightLabel);

        // Mode indicator and round score are shown by PhaseOverlay (HTML overlay)
        // so we don't draw them on canvas to avoid overlap

        // === Minimap ===
        drawMinimap(ctx, canvas, terr, gs, cam, hazardsRef.current);

        ctx.restore();
    };

    function drawMinimap(
        ctx: CanvasRenderingContext2D,
        canvas: HTMLCanvasElement,
        terr: TerrainData | null,
        gs: GameState | null,
        cam: { x: number; targetX: number },
        hzds?: HazardData[],
    ) {
        const mmW = 200;
        const mmH = 75;
        const mmX = canvas.width - mmW - 10;
        const mmY = canvas.height - mmH - 10;
        const scaleX = mmW / WORLD_WIDTH;
        const scaleY = mmH / CANVAS_HEIGHT;

        // Dark minimap background
        ctx.fillStyle = 'rgba(10, 10, 18, 0.8)';
        ctx.fillRect(mmX, mmY, mmW, mmH);
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(mmX, mmY, mmW, mmH);

        // Terrain silhouette
        if (terr && terr.points.length > 0) {
            ctx.beginPath();
            ctx.moveTo(mmX, mmY + mmH);
            for (const pt of terr.points) {
                ctx.lineTo(mmX + pt.x * scaleX, mmY + pt.y * scaleY);
            }
            ctx.lineTo(mmX + mmW, mmY + mmH);
            ctx.closePath();
            ctx.fillStyle = 'rgba(42, 74, 47, 0.6)';
            ctx.fill();
        }

        // Hazard zones
        if (hzds) {
            for (const h of hzds) {
                const hx = mmX + h.position.x * scaleX;
                const hy = mmY + h.position.y * scaleY;
                const hw = h.width * scaleX;
                const hh = h.height * scaleY;
                if (h.type === 'wind_zone') {
                    ctx.fillStyle = 'rgba(100, 150, 255, 0.3)';
                } else if (h.type === 'lava_pool') {
                    ctx.fillStyle = 'rgba(255, 100, 50, 0.4)';
                } else {
                    ctx.fillStyle = 'rgba(255, 200, 50, 0.3)';
                }
                ctx.fillRect(hx, hy, hw, hh);
            }
        }

        // Bodies: kings and projectiles
        if (gs) {
            for (const body of gs.bodies) {
                if (body.label === 'king') {
                    const kx = mmX + body.position.x * scaleX;
                    const ky = mmY + body.position.y * scaleY;
                    ctx.beginPath();
                    ctx.arc(kx, ky, 3, 0, Math.PI * 2);
                    ctx.fillStyle = body.position.x < WORLD_WIDTH / 2 ? '#22c55e' : '#ef4444';
                    ctx.fill();
                } else if (body.label === 'projectile') {
                    const px = mmX + body.position.x * scaleX;
                    const py = mmY + body.position.y * scaleY;
                    ctx.beginPath();
                    ctx.arc(px, py, 2, 0, Math.PI * 2);
                    ctx.fillStyle = '#fbbf24';
                    ctx.fill();
                }
            }
        }

        // Viewport rectangle
        const vpX = mmX + cam.x * scaleX;
        const vpW = CANVAS_WIDTH * scaleX;
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(vpX, mmY, vpW, mmH);
    }

    function drawKingHud(ctx: CanvasRenderingContext2D, hudX: number, hudY: number, king: KingHpState, label: string) {
        const hudWidth = 120;
        const hudHeight = 14;
        const hpRatio = king.maxHp > 0 ? Math.max(0, king.hp / king.maxHp) : 0;

        // Dark translucent HUD panel
        ctx.fillStyle = 'rgba(10, 10, 18, 0.8)';
        ctx.fillRect(hudX - 2, hudY - 2, hudWidth + 4, hudHeight + 18);
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(hudX - 2, hudY - 2, hudWidth + 4, hudHeight + 18);

        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'left';
        ctx.fillText(`\u265A ${label}`, hudX, hudY + 10);

        const barY = hudY + 14;
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(hudX, barY, hudWidth, hudHeight);
        ctx.fillStyle = getHpColor(hpRatio);
        ctx.fillRect(hudX, barY, hudWidth * hpRatio, hudHeight);
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(hudX, barY, hudWidth, hudHeight);

        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#e0d0b0';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.ceil(king.hp)} / ${king.maxHp}`, hudX + hudWidth / 2, barY + 11);
    }

    // Mouse coordinate helper — converts screen coords to world coords
    const getWorldCoords = (e: React.MouseEvent): { x: number; y: number } => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX + cameraRef.current.x,
            y: (e.clientY - rect.top) * scaleY,
        };
    };

    // Cannon position helper
    const getMyCannonPos = (): { x: number; y: number } => {
        const terr = terrainRef.current;
        const side = mySideRef.current;
        const cannonX = side === 'left' ? LEFT_CANNON_X : RIGHT_CANNON_X;
        if (!terr || terr.points.length === 0) return { x: cannonX, y: 480 };
        return { x: cannonX, y: interpolateTerrainY(terr.points, cannonX) - 20 };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        // Skip synthesized mouse events from touch
        if (Date.now() - lastTouchRef.current < 500) return;
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const screenX = (e.clientX - rect.left) * scaleX;
        const screenY = (e.clientY - rect.top) * scaleY;

        // Minimap click detection
        const mmW = 200;
        const mmH = 75;
        const mmX = canvas.width - mmW - 10;
        const mmY = canvas.height - mmH - 10;
        if (screenX >= mmX && screenX <= mmX + mmW && screenY >= mmY && screenY <= mmY + mmH) {
            const clickRatioX = (screenX - mmX) / mmW;
            const worldX = clickRatioX * WORLD_WIDTH;
            cameraRef.current.targetX = Math.max(0, Math.min(WORLD_WIDTH - CANVAS_WIDTH, worldX - CANVAS_WIDTH / 2));
            return;
        }

        const currentPhase = phaseRef.current;
        const side = mySideRef.current;

        if (currentPhase === 'build' && gameModeRef.current === 'build') {
            const { x, y } = getWorldCoords(e);
            onSpawnRef.current(x, y);
            return;
        }

        // Fire mode: start aiming (only during own combat turn)
        if (currentPhase === 'combat' && turnPlayerRef.current === side) {
            const aim = aimRef.current;
            aim.active = true;
            aim.useKeyboard = false;
            const { x: mx, y: my } = getWorldCoords(e);
            const cannon = getMyCannonPos();
            aim.angle = Math.atan2(cannon.y - my, Math.abs(mx - cannon.x));
            aim.angle = Math.max((10 * Math.PI) / 180, Math.min((170 * Math.PI) / 180, aim.angle));
            const dist = Math.sqrt((mx - cannon.x) ** 2 + (my - cannon.y) ** 2);
            aim.power = Math.max(5, Math.min(50, 5 + (dist / 200) * 45));
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (Date.now() - lastTouchRef.current < 500) return;
        if (!aimRef.current.active) return;
        const { x: mx, y: my } = getWorldCoords(e);
        const cannon = getMyCannonPos();
        const aim = aimRef.current;
        aim.angle = Math.atan2(cannon.y - my, Math.abs(mx - cannon.x));
        aim.angle = Math.max((10 * Math.PI) / 180, Math.min((170 * Math.PI) / 180, aim.angle));
        const dist = Math.sqrt((mx - cannon.x) ** 2 + (my - cannon.y) ** 2);
        aim.power = Math.max(5, Math.min(50, 5 + (dist / 200) * 45));
    };

    const handleMouseUp = () => {
        const aim = aimRef.current;
        if (!aim.active) return;
        aim.active = false;
        onFireRef.current(aim.angle, aim.power);
    };

    // --- Touch handlers for mobile ---
    const getTouchWorldCoords = (touch: React.Touch) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const screenX = (touch.clientX - rect.left) * scaleX;
        const screenY = (touch.clientY - rect.top) * scaleY;
        const cam = cameraRef.current;
        return { x: screenX + cam.x, y: screenY, screenX, screenY };
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        lastTouchRef.current = Date.now();

        // Two-finger: start camera pan
        if (e.touches.length === 2) {
            // Cancel any single-finger action in progress
            aimRef.current.active = false;
            touchStartRef.current = null;
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            panTouchRef.current = { startX: midX, camStartX: cameraRef.current.targetX };
            e.preventDefault();
            return;
        }

        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const { x, y, screenX, screenY } = getTouchWorldCoords(touch);

        // Minimap tap detection
        const canvas = canvasRef.current!;
        const mmW = 200;
        const mmH = 75;
        const mmX = canvas.width - mmW - 10;
        const mmY = canvas.height - mmH - 10;
        if (screenX >= mmX && screenX <= mmX + mmW && screenY >= mmY && screenY <= mmY + mmH) {
            const clickRatioX = (screenX - mmX) / mmW;
            const worldX = clickRatioX * WORLD_WIDTH;
            cameraRef.current.targetX = Math.max(0, Math.min(WORLD_WIDTH - CANVAS_WIDTH, worldX - CANVAS_WIDTH / 2));
            return;
        }

        const currentPhase = phaseRef.current;
        const side = mySideRef.current;

        if (currentPhase === 'build' && gameModeRef.current === 'build') {
            e.preventDefault();
            onSpawnRef.current(x, y);
            return;
        }

        if (currentPhase === 'combat' && turnPlayerRef.current === side) {
            e.preventDefault();
            const aim = aimRef.current;
            aim.active = true;
            aim.useKeyboard = false;
            // Store initial screen position for drag-relative power
            touchStartRef.current = { sx: screenX, sy: screenY };
            // Set angle from cannon to tap, start with medium power
            const cannon = getMyCannonPos();
            aim.angle = Math.atan2(cannon.y - y, Math.abs(x - cannon.x));
            aim.angle = Math.max((10 * Math.PI) / 180, Math.min((170 * Math.PI) / 180, aim.angle));
            aim.power = 25; // start at medium power
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        // Two-finger pan
        if (e.touches.length === 2 && panTouchRef.current) {
            e.preventDefault();
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const canvas = canvasRef.current!;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const deltaScreen = panTouchRef.current.startX - midX;
            const deltaWorld = deltaScreen * scaleX;
            cameraRef.current.targetX = Math.max(0, Math.min(
                WORLD_WIDTH - CANVAS_WIDTH,
                panTouchRef.current.camStartX + deltaWorld
            ));
            return;
        }

        if (!aimRef.current.active || e.touches.length !== 1) return;
        e.preventDefault();
        const { x: mx, y: my } = getTouchWorldCoords(e.touches[0]);
        const cannon = getMyCannonPos();
        const aim = aimRef.current;
        // Angle always tracks finger-to-cannon direction
        aim.angle = Math.atan2(cannon.y - my, Math.abs(mx - cannon.x));
        aim.angle = Math.max((10 * Math.PI) / 180, Math.min((170 * Math.PI) / 180, aim.angle));
        // Power from drag distance (screen pixels from initial tap)
        if (touchStartRef.current) {
            const canvas = canvasRef.current!;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const curSX = (e.touches[0].clientX - rect.left) * scaleX;
            const curSY = (e.touches[0].clientY - rect.top) * scaleY;
            const dragDist = Math.sqrt(
                (curSX - touchStartRef.current.sx) ** 2 +
                (curSY - touchStartRef.current.sy) ** 2
            );
            // 0px drag = 25 power, 300px drag = 50 power
            aim.power = Math.max(5, Math.min(50, 25 + (dragDist / 300) * 25));
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        // End two-finger pan when fingers are lifted
        if (panTouchRef.current) {
            if (e.touches.length < 2) {
                panTouchRef.current = null;
            }
            return;
        }

        const aim = aimRef.current;
        if (!aim.active) return;
        e.preventDefault();
        aim.active = false;
        touchStartRef.current = null;
        onFireRef.current(aim.angle, aim.power);
    };

    // Keyboard controls for camera + fire mode
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            // Camera pan keys
            if (e.key === 'a' || e.key === 'A' || e.key === 'd' || e.key === 'D') {
                keysRef.current.add(e.key);
            }

            // Fire mode controls
            if (phaseRef.current === 'combat' && turnPlayerRef.current === mySideRef.current) {
                const aim = aimRef.current;
                const degStep = (2 * Math.PI) / 180;

                switch (e.key) {
                    case 'ArrowLeft':
                        e.preventDefault();
                        aim.angle = Math.min((170 * Math.PI) / 180, aim.angle + degStep);
                        aim.useKeyboard = true;
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        aim.angle = Math.max((10 * Math.PI) / 180, aim.angle - degStep);
                        aim.useKeyboard = true;
                        break;
                    case 'ArrowUp':
                        e.preventDefault();
                        aim.power = Math.min(50, aim.power + 1);
                        aim.useKeyboard = true;
                        break;
                    case 'ArrowDown':
                        e.preventDefault();
                        aim.power = Math.max(5, aim.power - 1);
                        aim.useKeyboard = true;
                        break;
                    case ' ':
                        e.preventDefault();
                        onFireRef.current(aim.angle, aim.power);
                        break;
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            keysRef.current.delete(e.key);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    const handleWheel = (e: React.WheelEvent) => {
        // Scroll wheel adjusts power during combat
        if (phaseRef.current !== 'combat' || turnPlayerRef.current !== mySideRef.current) return;
        e.preventDefault();
        const aim = aimRef.current;
        const delta = e.deltaY < 0 ? 2 : -2;
        aim.power = Math.max(5, Math.min(50, aim.power + delta));
        aim.useKeyboard = true;
    };

    const cursorClass = (phase === 'build' && gameMode === 'build') ? 'cursor-crosshair' : 'cursor-default';

    return (
        <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onWheel={handleWheel}
            className={`w-full sm:border sm:border-[rgba(255,215,0,0.2)] sm:rounded-lg sm:shadow-2xl touch-none ${cursorClass}`}
            style={{ aspectRatio: '4 / 3' }}
        />
    );
};
