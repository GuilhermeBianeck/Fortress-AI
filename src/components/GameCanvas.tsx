import { useEffect, useRef, useCallback, useState } from 'react';
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
    setKingDamageCallback: (cb: ((data: { side: Side; damage: number }) => void) | null) => void;
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

// Server snapshot rate: 20Hz = 50ms between snapshots (must match SNAPSHOT_RATE in server/physics/loop.ts)
const SERVER_SNAPSHOT_MS = 50;

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

// === Physics Constants (Must match server) ===
const PHYSICS_GRAVITY = 2.0;
const PHYSICS_GRAVITY_SCALE = 0.001;
const PHYSICS_MAX_SPEED = 1000;
const PHYSICS_POWER_MULTIPLIER = 1.0;
const PHYSICS_AIR_FRICTION = 0.005;

interface DamageNumber { side: Side; damage: number; x: number; y: number; age: number; }

export const GameCanvas = ({
    gameState, terrain, onSpawn, kingsHp, mySide,
    gameMode, phase, turnPlayer, onFire,
    setBlockDestroyedCallback, setProjectileImpactCallback, setKingDamageCallback,
    playerNames, hazards, roundScore, currentRound,
}: GameCanvasProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Refs for minimap drag state
    const isDraggingMinimapRef = useRef(false);

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

    // Dynamic Canvas Size
    const [canvasSize, setCanvasSize] = useState({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const updateSize = () => {
            // Mobile breakpoint matches CSS (640px)
            if (window.innerWidth < 640 && containerRef.current) {
                // Use exact container size on mobile to prevent stretching
                const { clientWidth, clientHeight } = containerRef.current;
                if (clientWidth > 0 && clientHeight > 0) {
                    setCanvasSize({ width: clientWidth, height: clientHeight });
                }
            } else {
                // Fixed 4:3 on desktop
                setCanvasSize({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
            }
        };

        const observer = new ResizeObserver(updateSize);
        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        // Also listen to window resize for the breakpoint switch
        window.addEventListener('resize', updateSize);
        updateSize(); // Initial setup

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateSize);
        };
    }, []);

    // Helper for current dimensions (for effects/logic outside render loop)
    const { width: currentCanvasWidth, height: currentCanvasHeight } = canvasSize;

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

    // Floating damage numbers
    const damageNumbersRef = useRef<DamageNumber[]>([]);

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

    // Gradient cache: recreated only when canvas logical dimensions change
    const gradientCacheRef = useRef<{
        skyBg: CanvasGradient | null;
        horizonGlow: CanvasGradient | null;
        terrainFill: CanvasGradient | null;
        canvasW: number;
        canvasH: number;
    }>({ skyBg: null, horizonGlow: null, terrainFill: null, canvasW: 0, canvasH: 0 });

    // Previous kings HP for shake detection
    const prevKingsHpRef = useRef(kingsHp);

    // Animation frame ID
    const rafRef = useRef<number>(0);

    // Keys pressed for camera
    const keysRef = useRef<Set<string>>(new Set());

    // Flag to ensure initial camera setup only happens once
    const hasPannedForPhaseRef = useRef<string | null>(null);

    // Interpolation state: store previous snapshot for smooth movement
    const prevBodiesRef = useRef<Map<number, { x: number; y: number; angle: number }>>(new Map());
    const snapshotTimeRef = useRef<number>(0);

    // Sync refs
    useEffect(() => {
        // On each new server snapshot, capture previous positions for interpolation
        if (gameState) {
            const prevMap = prevBodiesRef.current;
            const gsRef = gameStateRef.current;
            if (gsRef) {
                prevMap.clear();
                for (const body of gsRef.bodies) {
                    prevMap.set(body.id, { x: body.position.x, y: body.position.y, angle: body.angle });
                }
            }
            snapshotTimeRef.current = performance.now();
        }
        gameStateRef.current = gameState;
    }, [gameState]);
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
        setKingDamageCallback((data) => {
            const kingHp = kingsHpRef.current[data.side];
            const x = kingHp.x ?? (data.side === 'left' ? 300 : WORLD_WIDTH - 300);
            const y = (kingHp.y ?? 400) - 30;
            damageNumbersRef.current.push({
                side: data.side,
                damage: Math.round(data.damage),
                x: x + (Math.random() - 0.5) * 20,
                y,
                age: 0,
            });
        });
        return () => {
            setBlockDestroyedCallback(null);
            setProjectileImpactCallback(null);
            setKingDamageCallback(null);
        };
    }, [setBlockDestroyedCallback, setProjectileImpactCallback, setKingDamageCallback, triggerShake]);

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
            const kingX = kingsHp[mySide]?.x;
            if (kingX) {
                // Re-pan if phase changed OR canvas width changed (mobile resize)
                const panKey = `${phase}_${currentCanvasWidth}`;
                if (hasPannedForPhaseRef.current === panKey) return;
                const maxCamX = WORLD_WIDTH - currentCanvasWidth;
                const target = Math.max(0, Math.min(maxCamX, kingX - currentCanvasWidth / 2));
                cam.targetX = target;
                cam.x = target; // Snap immediately so King is centered from the first frame
                hasPannedForPhaseRef.current = panKey;
            }
        } else if (phase === 'reveal') {
            if (hasPannedForPhaseRef.current?.startsWith('reveal')) return;
            const myKingX = kingsHp[mySide]?.x;
            const enemyKingX = kingsHp[mySide === 'left' ? 'right' : 'left']?.x;

            if (myKingX && enemyKingX) {
                const maxCamX = WORLD_WIDTH - currentCanvasWidth;
                cam.targetX = Math.max(0, Math.min(maxCamX, myKingX - currentCanvasWidth / 2));
                const panTimer = setTimeout(() => {
                    cam.targetX = Math.max(0, Math.min(maxCamX, enemyKingX - currentCanvasWidth / 2));
                }, 2500);
                hasPannedForPhaseRef.current = 'reveal';
                return () => clearTimeout(panTimer);
            }
        } else {
            hasPannedForPhaseRef.current = phase;
        }
    }, [phase, mySide, currentCanvasWidth, kingsHp]);

    // Auto-pan to active cannon when it's their turn
    useEffect(() => {
        if (phase !== 'combat') return;
        if (turnPlayer) {
            const cannonX = turnPlayer === 'left' ? LEFT_CANNON_X : RIGHT_CANNON_X;
            cameraRef.current.targetX = Math.max(0, Math.min(
                WORLD_WIDTH - currentCanvasWidth,
                cannonX - currentCanvasWidth / 2
            ));
        }
    }, [phase, turnPlayer, currentCanvasWidth]);

    // Track projectile during combat for auto-pan
    useEffect(() => {
        if (phase !== 'combat' || !gameState) return;
        const projectile = gameState.bodies.find(b => b.label === 'projectile');
        if (projectile) {
            cameraRef.current.targetX = Math.max(0, Math.min(
                WORLD_WIDTH - currentCanvasWidth,
                projectile.position.x - currentCanvasWidth / 2
            ));
        }
    }, [phase, gameState, currentCanvasWidth]);

    // 60fps render loop
    useEffect(() => {
        const render = () => {
            renderFrame();
            rafRef.current = requestAnimationFrame(render);
        };
        rafRef.current = requestAnimationFrame(render);
        return () => {
            cancelAnimationFrame(rafRef.current);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const renderFrame = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        // Reset and scale for High DPI
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Logical dimensions (same as canvasSize state)
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        const gs = gameStateRef.current;
        const terr = terrainRef.current;
        const cam = cameraRef.current;

        // Compute interpolation factor: 0 = at previous snapshot, 1 = at current snapshot
        const prevBodies = prevBodiesRef.current;
        const elapsed = performance.now() - snapshotTimeRef.current;
        const interpT = Math.min(elapsed / SERVER_SNAPSHOT_MS, 1);

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
        cam.targetX = Math.max(0, Math.min(WORLD_WIDTH - width, cam.targetX));
        const lerpFactor = currentPhase === 'reveal' ? 0.015 : 0.1;
        cam.x += (cam.targetX - cam.x) * lerpFactor;

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

        // Single timestamp for the entire frame — avoids multiple Date.now() calls
        const nowMs = Date.now();

        // Rebuild gradients only when canvas logical size changes
        const gradCache = gradientCacheRef.current;
        if (gradCache.canvasW !== width || gradCache.canvasH !== height) {
            gradCache.skyBg = ctx.createLinearGradient(0, 0, 0, height);
            gradCache.skyBg.addColorStop(0, '#0a0a14');
            gradCache.skyBg.addColorStop(0.2, '#0d0d1a');
            gradCache.skyBg.addColorStop(0.45, '#141428');
            gradCache.skyBg.addColorStop(0.7, '#1a1a3e');
            gradCache.skyBg.addColorStop(0.88, '#2a1a1a');
            gradCache.skyBg.addColorStop(1, '#1a1008');

            gradCache.horizonGlow = ctx.createRadialGradient(width / 2, height * 0.85, 0, width / 2, height * 0.85, width * 0.6);
            gradCache.horizonGlow.addColorStop(0, 'rgba(180, 100, 30, 0.08)');
            gradCache.horizonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

            gradCache.terrainFill = ctx.createLinearGradient(0, 400, 0, height);
            gradCache.terrainFill.addColorStop(0, '#2a3a20');
            gradCache.terrainFill.addColorStop(0.15, '#1e2a18');
            gradCache.terrainFill.addColorStop(0.4, '#1e1510');
            gradCache.terrainFill.addColorStop(1, '#0e0a08');

            gradCache.canvasW = width;
            gradCache.canvasH = height;
        }

        // Dark twilight sky gradient (cached)
        ctx.fillStyle = gradCache.skyBg!;
        ctx.fillRect(-10, -10, width + 20, height + 20);

        // Twinkling stars (upper sky only)
        const starSeed = 42;
        const starTime = nowMs / 1000;
        for (let i = 0; i < 60; i++) {
            const sx = ((i * 137.508 + starSeed * 73) % (width + 200)) - 100;
            const sy = ((i * 97.3 + starSeed * 31) % (height * 0.55));
            const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(starTime * (0.5 + (i % 5) * 0.3) + i * 1.7));
            const size = 0.5 + (i % 3) * 0.5;
            ctx.beginPath();
            ctx.arc(sx, sy, size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200, 210, 255, ${(twinkle * 0.6).toFixed(2)})`;
            ctx.fill();
        }

        // Subtle horizon glow (cached)
        ctx.fillStyle = gradCache.horizonGlow!;
        ctx.fillRect(0, 0, width, height);

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
        const drawLayer = (color: string, layerHeight: number, parallaxFactor: number, seedOffset: number, verticalOffset: number, frequency: number) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            const startX = -100;
            const endX = width + 100;
            const camX = cam.x * parallaxFactor;
            // Use terrain seed if available, otherwise 0
            const baseSeed = terr?.seed ?? 0;
            const amplitude = 120; // Fixed amplitude for background layers

            ctx.moveTo(startX, height);
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

                const y = height - layerHeight + noise + verticalOffset;

                ctx.lineTo(x, y);
            }
            ctx.lineTo(endX, height);
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
            if (drawX > -300 && drawX < width + 300) {
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

            // Dark earth terrain gradient (cached)
            ctx.fillStyle = gradCache.terrainFill!;
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

            // Build zone overlays (more visible during build phase)
            const isBuildPhase = currentPhase === 'build';
            for (const zone of terr.buildZones) {
                // Determine if this zone belongs to the current player
                const isMyZone = isBuildPhase && (
                    (side === 'left' && zone.x < WORLD_WIDTH / 2) ||
                    (side === 'right' && zone.x >= WORLD_WIDTH / 2)
                );
                const zoneAlpha = isBuildPhase ? (isMyZone ? 0.1 : 0.04) : 0.03;
                const borderAlpha = isBuildPhase ? (isMyZone ? 0.4 : 0.15) : 0.1;
                // My zone: green tint; enemy zone: red tint; non-build: gold
                const zoneColor = isBuildPhase
                    ? (isMyZone ? '39, 174, 96' : '192, 57, 43')
                    : '255, 215, 0';
                ctx.fillStyle = `rgba(${zoneColor}, ${zoneAlpha})`;
                ctx.fillRect(zone.x, zone.y - 200, zone.width, 200);
                ctx.strokeStyle = `rgba(${zoneColor}, ${borderAlpha})`;
                ctx.lineWidth = isBuildPhase ? 1.5 : 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(zone.x, zone.y - 2);
                ctx.lineTo(zone.x + zone.width, zone.y - 2);
                ctx.stroke();
                // Vertical build zone borders during build phase
                if (isBuildPhase) {
                    ctx.beginPath();
                    ctx.moveTo(zone.x, zone.y - 200);
                    ctx.lineTo(zone.x, zone.y - 2);
                    ctx.moveTo(zone.x + zone.width, zone.y - 200);
                    ctx.lineTo(zone.x + zone.width, zone.y - 2);
                    ctx.stroke();
                }
                ctx.setLineDash([]);
                // Zone label during build phase
                if (isBuildPhase) {
                    const labelAlpha = isMyZone ? 0.55 : 0.25;
                    const label = isMyZone ? 'YOUR ZONE' : 'ENEMY ZONE';
                    ctx.font = `bold ${isMyZone ? 13 : 11}px monospace`;
                    ctx.fillStyle = `rgba(${zoneColor}, ${labelAlpha})`;
                    ctx.textAlign = 'center';
                    ctx.fillText(label, zone.x + zone.width / 2, zone.y - 182);
                }
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
            const animPhase = nowMs / 1000;
            for (const h of hzds) {
                if (h.type === 'wind_zone') {
                    // Subtle blue tint
                    ctx.fillStyle = 'rgba(100, 150, 255, 0.03)';
                    ctx.fillRect(h.position.x, h.position.y, h.width, h.height);

                    // Organic wind particles — curved streaks with wobble
                    const dir = h.windDirection ?? 1;
                    const visibleLeft = cam.x - 100;
                    const visibleRight = cam.x + canvas.width + 100;
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

                // Pulsing glow ring on active cannon — shows player where to drag
                if (isActive && currentPhase === 'combat' && !aim.active && !aim.useKeyboard) {
                    const pulse = 0.5 + 0.5 * Math.sin(nowMs / 350);
                    ctx.beginPath();
                    ctx.arc(cannonX, cannonY, 16 + pulse * 5, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(255, 215, 0, ${(0.25 + pulse * 0.45).toFixed(2)})`;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    // Inner subtle glow fill
                    ctx.beginPath();
                    ctx.arc(cannonX, cannonY, 14, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 215, 0, ${(0.05 + pulse * 0.07).toFixed(2)})`;
                    ctx.fill();
                }

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
                    // Match server physics exactly
                    // Server: delta = 1000/60
                    // Update loop: 2 sub-steps of delta/2

                    const dt = 1000 / 60 / 2; // ~8.3333ms

                    // Gravity force = mass * gravity.y * gravity.scale
                    // Acceleration = force / mass = gravity.y * gravity.scale
                    // Velocity += acceleration * dt
                    // But Matter.js applies gravity as: velocity.y += gravity.y * gravity.scale * dt
                    // Wait, Matter.js Engine.update uses correction:
                    // correction = delta / lastDelta
                    // velocity += (force * dt / mass) + (gravity * dt)

                    // Let's use the explicit trusted formula from Matter.js source logic:
                    // position += velocity
                    // velocity.x *= airFriction
                    // velocity.y *= airFriction
                    // velocity.y += gravity * scale * dt

                    const gravityAccel = PHYSICS_GRAVITY * PHYSICS_GRAVITY_SCALE * dt;
                    const airDamp = 1 - PHYSICS_AIR_FRICTION;

                    const dirMult = facingRight ? 1 : -1;
                    let px = cannonX + dirMult * Math.cos(currentAngle) * 24;
                    let py = cannonY - Math.sin(currentAngle) * 24;

                    // Initial velocity
                    let vx = dirMult * (aim.power * PHYSICS_POWER_MULTIPLIER) * Math.cos(currentAngle);
                    let vy = -(aim.power * PHYSICS_POWER_MULTIPLIER) * Math.sin(currentAngle);

                    // Speed Cap
                    let speed = Math.sqrt(vx * vx + vy * vy);
                    if (speed > PHYSICS_MAX_SPEED) {
                        const s = PHYSICS_MAX_SPEED / speed;
                        vx *= s;
                        vy *= s;
                    }

                    // Full trajectory arc preview - solid dashed line
                    const frames = 120;
                    ctx.beginPath();
                    ctx.moveTo(px, py);

                    for (let f = 0; f < frames; f++) {
                        // Simulate 2 sub-steps per frame to match server
                        for (let sub = 0; sub < 2; sub++) {
                            vy += gravityAccel;
                            vx *= airDamp;
                            vy *= airDamp;
                            px += vx;
                            py += vy;

                            // Per-tick speed cap matching server
                            speed = Math.sqrt(vx * vx + vy * vy);
                            if (speed > PHYSICS_MAX_SPEED) {
                                const cap = PHYSICS_MAX_SPEED / speed;
                                vx *= cap;
                                vy *= cap;
                            }
                        }

                        ctx.lineTo(px, py);
                        if (py > canvas.height + 50 || px < -50 || px > WORLD_WIDTH + 50) break;
                    }

                    ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([6, 6]);
                    ctx.stroke();
                    ctx.setLineDash([]);
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
                    const powerRatio = (aim.power - 5) / 95;
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

                // Interpolate position and angle for smooth movement between server snapshots
                let drawX = body.position.x;
                let drawY = body.position.y;
                let drawAngle = body.angle;

                const prev = prevBodies.get(body.id);
                if (prev && interpT < 1) {
                    drawX = prev.x + (body.position.x - prev.x) * interpT;
                    drawY = prev.y + (body.position.y - prev.y) * interpT;
                    // Interpolate angle with shortest-path wrapping
                    let dAngle = body.angle - prev.angle;
                    if (dAngle > Math.PI) dAngle -= Math.PI * 2;
                    if (dAngle < -Math.PI) dAngle += Math.PI * 2;
                    drawAngle = prev.angle + dAngle * interpT;
                }

                ctx.save();
                ctx.translate(drawX, drawY);
                ctx.rotate(drawAngle);

                const fillColor = body.color || MATERIAL_COLORS[body.material] || MATERIAL_COLORS[body.label] || '#e11d48';
                const strokeColor = MATERIAL_STROKE[body.material] || MATERIAL_STROKE[body.label] || 'rgba(255,255,255,0.3)';

                if (body.circleRadius > 0) {
                    if (body.label === 'king') {
                        // King: golden glow drop shadow
                        ctx.shadowColor = 'rgba(255, 215, 0, 0.4)';
                        ctx.shadowBlur = 8;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                    }
                    // Skip shadowBlur for projectiles and other circles — they use the glow effect below

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
                        // Crown icon — larger and on top
                        ctx.font = 'bold 14px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillStyle = '#FFD700';
                        ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';
                        ctx.shadowBlur = 6;
                        ctx.fillText('♛', 0, -body.circleRadius - 4);
                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;
                    }

                    // Projectile glow
                    if (body.label === 'projectile') {
                        ctx.beginPath();
                        ctx.arc(0, 0, body.circleRadius + 4, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(255, 180, 50, 0.25)';
                        ctx.fill();
                    }
                } else if (!body.isStatic || body.label === 'foundation') {
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
                    const kingSide: Side = drawX < WORLD_WIDTH / 2 ? 'left' : 'right';
                    const kHp = kings[kingSide].hp;
                    const kMaxHp = kings[kingSide].maxHp;
                    if (kMaxHp > 0) {
                        const barWidth = 30;
                        const barHeight = 4;
                        const barX = drawX - barWidth / 2;
                        const barY = drawY - (body.circleRadius || 12) - 10;
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
                    const barX = drawX - barWidth / 2;
                    const barY = drawY - (body.height || 30) / 2 - 6;
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

        // Draw floating damage numbers (in world space)
        const dmgNums = damageNumbersRef.current;
        for (let i = dmgNums.length - 1; i >= 0; i--) {
            const dn = dmgNums[i];
            dn.age++;
            if (dn.age > 60) {
                dmgNums.splice(i, 1);
                continue;
            }
            const progress = dn.age / 60;
            const alpha = 1 - progress;
            const yOffset = -progress * 40;
            const scale = 1 + progress * 0.3;
            ctx.save();
            ctx.translate(dn.x, dn.y + yOffset);
            ctx.scale(scale, scale);
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
            ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.7})`;
            ctx.lineWidth = 3;
            const text = `-${dn.damage}`;
            ctx.strokeText(text, 0, 0);
            ctx.fillText(text, 0, 0);
            ctx.restore();
        }

        // === End world drawing ===
        ctx.restore();

        // HUD (fixed to screen, not affected by camera)
        const isMobile = width < 640;
        const topPadding = isMobile ? 48 : 12;

        // Left King HP bar (top-left)
        const names = playerNamesRef.current;
        const leftLabel = names?.left || (side === 'left' ? 'YOU' : 'ENEMY');
        const rightLabel = names?.right || (side === 'right' ? 'YOU' : 'ENEMY');
        drawKingHud(ctx, 12, topPadding, kings.left, leftLabel);

        // Right King HP bar (top-right)
        drawKingHud(ctx, width - 132, topPadding, kings.right, rightLabel);

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
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        // Minimap background (Moved up to clear tools)
        const mmW = 200;
        const mmH = 75;
        const mmX = width - mmW - 10;
        const mmY = height - mmH - 65; // Raised 65px (was 80)
        const scaleX = mmW / WORLD_WIDTH;
        const scaleY = mmH / height;

        // Dark minimap background with rounded corners
        ctx.beginPath();
        const mmR = 6;
        ctx.moveTo(mmX + mmR, mmY);
        ctx.lineTo(mmX + mmW - mmR, mmY);
        ctx.arcTo(mmX + mmW, mmY, mmX + mmW, mmY + mmR, mmR);
        ctx.lineTo(mmX + mmW, mmY + mmH - mmR);
        ctx.arcTo(mmX + mmW, mmY + mmH, mmX + mmW - mmR, mmY + mmH, mmR);
        ctx.lineTo(mmX + mmR, mmY + mmH);
        ctx.arcTo(mmX, mmY + mmH, mmX, mmY + mmH - mmR, mmR);
        ctx.lineTo(mmX, mmY + mmR);
        ctx.arcTo(mmX, mmY, mmX + mmR, mmY, mmR);
        ctx.closePath();
        ctx.fillStyle = 'rgba(10, 10, 18, 0.85)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

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
        const vpW = width * scaleX;
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(vpX, mmY, vpW, mmH);
    }

    function drawKingHud(ctx: CanvasRenderingContext2D, hudX: number, hudY: number, king: KingHpState, label: string) {
        const hudWidth = 120;
        const barHeight = 12;
        const hpRatio = king.maxHp > 0 ? Math.max(0, king.hp / king.maxHp) : 0;
        const cornerR = 6;
        const totalH = barHeight + 22;

        // Rounded translucent HUD panel
        ctx.beginPath();
        ctx.moveTo(hudX + cornerR, hudY);
        ctx.lineTo(hudX + hudWidth + 4 - cornerR, hudY);
        ctx.arcTo(hudX + hudWidth + 4, hudY, hudX + hudWidth + 4, hudY + cornerR, cornerR);
        ctx.lineTo(hudX + hudWidth + 4, hudY + totalH - cornerR);
        ctx.arcTo(hudX + hudWidth + 4, hudY + totalH, hudX + hudWidth + 4 - cornerR, hudY + totalH, cornerR);
        ctx.lineTo(hudX + cornerR, hudY + totalH);
        ctx.arcTo(hudX, hudY + totalH, hudX, hudY + totalH - cornerR, cornerR);
        ctx.lineTo(hudX, hudY + cornerR);
        ctx.arcTo(hudX, hudY, hudX + cornerR, hudY, cornerR);
        ctx.closePath();
        ctx.fillStyle = 'rgba(10, 10, 18, 0.85)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Player name label
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'left';
        ctx.fillText(`♛ ${label}`, hudX + 4, hudY + 13);

        // HP bar with gradient fill
        const barY = hudY + 18;
        const barX = hudX + 4;
        const barW = hudWidth - 4;
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(barX, barY, barW, barHeight);

        if (hpRatio > 0) {
            const grad = ctx.createLinearGradient(barX, barY, barX + barW * hpRatio, barY);
            if (hpRatio > 0.5) {
                grad.addColorStop(0, '#27ae60');
                grad.addColorStop(1, '#2ecc71');
            } else if (hpRatio > 0.25) {
                grad.addColorStop(0, '#e67e22');
                grad.addColorStop(1, '#f39c12');
            } else {
                grad.addColorStop(0, '#c0392b');
                grad.addColorStop(1, '#e74c3c');
            }
            ctx.fillStyle = grad;
            ctx.fillRect(barX, barY, barW * hpRatio, barHeight);
        }

        ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(barX, barY, barW, barHeight);

        // HP text
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#e0d0b0';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.ceil(king.hp)} / ${king.maxHp}`, barX + barW / 2, barY + 9);
    }

    // Mouse coordinate helper — converts screen coords to world coords
    const getWorldCoords = (e: React.MouseEvent): { x: number; y: number } => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const scaleX = (canvas.width / dpr) / rect.width;
        const scaleY = (canvas.height / dpr) / rect.height;
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
        const dpr = window.devicePixelRatio || 1;
        const scaleX = (canvas.width / dpr) / rect.width;
        const scaleY = (canvas.height / dpr) / rect.height;
        // Logical (scaled) screen coords for minimap/HUD detection
        const screenX = (e.clientX - rect.left) * scaleX;
        const screenY = (e.clientY - rect.top) * scaleY;

        // Minimap click detection
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        const mmW = 200;
        const mmH = 75;
        const mmX = width - mmW - 10;
        const mmY = height - mmH - 65;

        if (screenX >= mmX && screenX <= mmX + mmW && screenY >= mmY && screenY <= mmY + mmH) {
            isDraggingMinimapRef.current = true;
            const clickRatioX = (screenX - mmX) / mmW;
            const worldX = clickRatioX * WORLD_WIDTH;
            cameraRef.current.targetX = Math.max(0, Math.min(WORLD_WIDTH - width, worldX - width / 2));
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
            // Non-linear power mapping for better sensitivity
            const normalizedDist = Math.max(0, Math.min(1, dist / 800));
            aim.power = Math.max(5, Math.min(100, 5 + Math.pow(normalizedDist, 1.2) * 95));
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (Date.now() - lastTouchRef.current < 500) return;

        // Minimap drag handling
        if (isDraggingMinimapRef.current && canvasRef.current) {
            const canvas = canvasRef.current;
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const scaleX = (canvas.width / dpr) / rect.width;
            const screenX = (e.clientX - rect.left) * scaleX;

            const width = canvas.width / dpr;
            const mmW = 200;
            const mmX = width - mmW - 10;

            // Allow dragging slightly outside bounds for forgiving UX
            const clickRatioX = Math.max(0, Math.min(1, (screenX - mmX) / mmW));
            const worldX = clickRatioX * WORLD_WIDTH;
            cameraRef.current.targetX = Math.max(0, Math.min(WORLD_WIDTH - width, worldX - width / 2));
            return;
        }

        if (!aimRef.current.active) return;
        const { x: mx, y: my } = getWorldCoords(e);
        const cannon = getMyCannonPos();
        const aim = aimRef.current;
        aim.angle = Math.atan2(cannon.y - my, Math.abs(mx - cannon.x));
        aim.angle = Math.max((10 * Math.PI) / 180, Math.min((170 * Math.PI) / 180, aim.angle));
        const dist = Math.sqrt((mx - cannon.x) ** 2 + (my - cannon.y) ** 2);
        // Non-linear power mapping for better sensitivity
        const normalizedDist = Math.max(0, Math.min(1, dist / 800));
        aim.power = Math.max(5, Math.min(100, 5 + Math.pow(normalizedDist, 1.2) * 95));
    };

    const handleMouseUp = () => {
        if (isDraggingMinimapRef.current) {
            isDraggingMinimapRef.current = false;
        }

        const aim = aimRef.current;
        if (!aim.active) return;
        aim.active = false;
        onFireRef.current(aim.angle, aim.power);
    };

    // --- Touch handlers for mobile ---
    const getTouchWorldCoords = (touch: React.Touch) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const scaleX = (canvas.width / dpr) / rect.width;
        const scaleY = (canvas.height / dpr) / rect.height;
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
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        const mmW = 200;
        const mmH = 75;
        const mmX = width - mmW - 10;
        const mmY = height - mmH - 65;
        if (screenX >= mmX && screenX <= mmX + mmW && screenY >= mmY && screenY <= mmY + mmH) {
            isDraggingMinimapRef.current = true;
            const clickRatioX = (screenX - mmX) / mmW;
            const worldX = clickRatioX * WORLD_WIDTH;
            cameraRef.current.targetX = Math.max(0, Math.min(WORLD_WIDTH - width, worldX - width / 2));
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
            const canvas = canvasRef.current!;
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const scaleX = (canvas.width / dpr) / rect.width;
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            // Scale the delta to logical coords for accurate 1:1 panning
            const deltaScreen = (panTouchRef.current.startX - midX) * scaleX;
            cameraRef.current.targetX = Math.max(0, Math.min(
                WORLD_WIDTH - (canvas.width / dpr),
                panTouchRef.current.camStartX + deltaScreen
            ));
            return;
        }

        if (isDraggingMinimapRef.current && e.touches.length === 1 && canvasRef.current) {
            e.preventDefault();
            const canvas = canvasRef.current;
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const scaleX = (canvas.width / dpr) / rect.width;
            const screenX = (e.touches[0].clientX - rect.left) * scaleX;

            const width = canvas.width / dpr;
            const mmW = 200;
            const mmX = width - mmW - 10;

            const clickRatioX = Math.max(0, Math.min(1, (screenX - mmX) / mmW));
            const worldX = clickRatioX * WORLD_WIDTH;
            cameraRef.current.targetX = Math.max(0, Math.min(WORLD_WIDTH - width, worldX - width / 2));
            return;
        }

        if (!aimRef.current.active || e.touches.length !== 1) return;
        e.preventDefault();
        const { x: mx, y: my } = getTouchWorldCoords(e.touches[0]);
        const cannon = getMyCannonPos();
        const aim = aimRef.current;
        // Angle always tracks finger-to-cannon direction as before
        aim.angle = Math.atan2(cannon.y - my, Math.abs(mx - cannon.x));
        aim.angle = Math.max((10 * Math.PI) / 180, Math.min((170 * Math.PI) / 180, aim.angle));

        // Power from drag distance (screen pixels from initial tap)
        if (touchStartRef.current) {
            const touch = e.touches[0];
            const canvas = canvasRef.current!;
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const scaleX = (canvas.width / dpr) / rect.width;
            const scaleY = (canvas.height / dpr) / rect.height;
            const currentScreenX = (touch.clientX - rect.left) * scaleX;
            const currentScreenY = (touch.clientY - rect.top) * scaleY;

            const dx = currentScreenX - touchStartRef.current.sx;
            const dy = currentScreenY - touchStartRef.current.sy;
            const dragDist = Math.sqrt(dx * dx + dy * dy);

            // Map 0-300px of drag to 0-100 power
            const dragPower = (dragDist / 300) * 100;
            // Start at 25 (minimum viable shot) and add drag power
            aim.power = Math.max(5, Math.min(100, 25 + dragPower));
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (isDraggingMinimapRef.current) {
            isDraggingMinimapRef.current = false;
        }

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
                        aim.power = Math.min(100, aim.power + 1);
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
        aim.power = Math.max(5, Math.min(100, aim.power + delta));
        aim.useKeyboard = true;
    };

    const cursorClass = (phase === 'build' && gameMode === 'build') ? 'cursor-crosshair' : 'cursor-default';

    return (
        <div ref={containerRef} className="w-full h-full relative">
            <canvas
                ref={canvasRef}
                width={currentCanvasWidth * (window.devicePixelRatio || 1)}
                height={currentCanvasHeight * (window.devicePixelRatio || 1)}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                onWheel={handleWheel}
                className={`w-full h-full sm:h-auto game-canvas-responsive sm:border sm:border-[rgba(255,215,0,0.2)] sm:rounded-lg sm:shadow-2xl touch-none ${cursorClass}`}
            />
        </div>
    );
};
