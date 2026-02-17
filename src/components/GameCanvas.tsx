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

// Material color map (fallback if server doesn't send color)
const MATERIAL_COLORS: Record<string, string> = {
    wood: '#A67C52',
    stone: '#7D7D7D',
    ice: '#A5F2F3',
    rubber: '#FF69B4',
    steel: '#434B4D',
    king: '#FFD700',
    Terrain: '#1a1a2e',
};

const MATERIAL_STROKE: Record<string, string> = {
    wood: '#8B6914',
    stone: '#5a5a5a',
    ice: '#7FD4D5',
    rubber: '#D4508A',
    steel: '#2e3436',
    king: '#DAA520',
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

    // Screen shake
    const shakeRef = useRef({ amplitude: 0, remaining: 0, max: 0 });

    // Particles
    const particlesRef = useRef(new ParticleSystem());

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
        const render = () => {
            renderFrame();
            rafRef.current = requestAnimationFrame(render);
        };
        rafRef.current = requestAnimationFrame(render);
        return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const renderFrame = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const gs = gameStateRef.current;
        const terr = terrainRef.current;
        const kings = kingsHpRef.current;
        const side = mySideRef.current;
        const currentPhase = phaseRef.current;
        const currentTurn = turnPlayerRef.current;
        const aim = aimRef.current;
        const shake = shakeRef.current;
        const particles = particlesRef.current;
        const cam = cameraRef.current;

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

        // Clear with gradient background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGrad.addColorStop(0, '#0a0a1a');
        bgGrad.addColorStop(0.6, '#0f0f2e');
        bgGrad.addColorStop(1, '#1a1a3e');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(-10, -10, canvas.width + 20, canvas.height + 20);

        // Draw stars (fixed to screen, not world)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        for (let i = 0; i < 40; i++) {
            const sx = (i * 137.5) % canvas.width;
            const sy = (i * 73.7) % (canvas.height * 0.5);
            const size = (i % 3 === 0) ? 1.5 : 1;
            ctx.beginPath();
            ctx.arc(sx, sy, size, 0, Math.PI * 2);
            ctx.fill();
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

            const terrainGrad = ctx.createLinearGradient(0, 400, 0, canvas.height);
            terrainGrad.addColorStop(0, '#2a3a2a');
            terrainGrad.addColorStop(0.3, '#1f2f1f');
            terrainGrad.addColorStop(1, '#0a150a');
            ctx.fillStyle = terrainGrad;
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(terr.points[0].x, terr.points[0].y);
            for (let i = 1; i < terr.points.length; i++) {
                ctx.lineTo(terr.points[i].x, terr.points[i].y);
            }
            ctx.strokeStyle = 'rgba(100, 200, 100, 0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Build zone overlays
            for (const zone of terr.buildZones) {
                ctx.fillStyle = 'rgba(100, 200, 100, 0.05)';
                ctx.fillRect(zone.x, zone.y - 100, zone.width, 100);
                ctx.strokeStyle = 'rgba(100, 200, 100, 0.15)';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(zone.x, zone.y - 2);
                ctx.lineTo(zone.x + zone.width, zone.y - 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Draw center divider line
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.2)';
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

                // Barrel
                ctx.save();
                ctx.translate(cannonX, cannonY);
                const barrelAngle = facingRight ? -currentAngle : -(Math.PI - currentAngle);
                ctx.rotate(barrelAngle);
                ctx.fillStyle = isActive ? '#555' : '#333';
                ctx.fillRect(0, -4, 24, 8);
                ctx.strokeStyle = isActive ? '#777' : '#555';
                ctx.lineWidth = 1;
                ctx.strokeRect(0, -4, 24, 8);
                ctx.restore();

                // Base
                ctx.beginPath();
                ctx.arc(cannonX, cannonY, 6, 0, Math.PI * 2);
                ctx.fillStyle = isActive ? '#555' : '#444';
                ctx.fill();
                ctx.strokeStyle = isActive ? '#888' : '#666';
                ctx.lineWidth = 1;
                ctx.stroke();

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
                            ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
                            ctx.fill();
                        }

                        if (py > CANVAS_HEIGHT + 50 || px < -50 || px > WORLD_WIDTH + 50) break;
                    }
                }

                // Aim readout (always show when aiming)
                if (isActive && (aim.active || aim.useKeyboard) && currentPhase === 'combat') {
                    ctx.font = 'bold 10px monospace';
                    ctx.fillStyle = '#fff';
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
                const alpha = (i + 1) / positions.length * 0.4;
                ctx.beginPath();
                ctx.arc(positions[i].x, positions[i].y, 3, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(200, 150, 100, ${alpha})`;
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
                        ctx.arc(0, 0, body.circleRadius + 3, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(255, 150, 50, 0.15)';
                        ctx.fill();
                    }
                } else if (!body.isStatic) {
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

                    // Inner highlight
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
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

                        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                        ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
                        ctx.fillStyle = '#333';
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

                    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                    ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
                    ctx.fillStyle = '#333';
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

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(mmX, mmY, mmW, mmH);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
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
            ctx.fillStyle = 'rgba(100, 200, 100, 0.4)';
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
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(vpX, mmY, vpW, mmH);
    }

    function drawKingHud(ctx: CanvasRenderingContext2D, hudX: number, hudY: number, king: KingHpState, label: string) {
        const hudWidth = 120;
        const hudHeight = 14;
        const hpRatio = king.maxHp > 0 ? Math.max(0, king.hp / king.maxHp) : 0;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(hudX - 2, hudY - 2, hudWidth + 4, hudHeight + 18);

        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'left';
        ctx.fillText(`\u265A ${label}`, hudX, hudY + 10);

        const barY = hudY + 14;
        ctx.fillStyle = '#333';
        ctx.fillRect(hudX, barY, hudWidth, hudHeight);
        ctx.fillStyle = getHpColor(hpRatio);
        ctx.fillRect(hudX, barY, hudWidth * hpRatio, hudHeight);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(hudX, barY, hudWidth, hudHeight);

        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#fff';
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
            const cannon = getMyCannonPos();
            aim.angle = Math.atan2(cannon.y - y, Math.abs(x - cannon.x));
            aim.angle = Math.max((10 * Math.PI) / 180, Math.min((170 * Math.PI) / 180, aim.angle));
            const dist = Math.sqrt((x - cannon.x) ** 2 + (y - cannon.y) ** 2);
            aim.power = Math.max(5, Math.min(50, 5 + (dist / 200) * 45));
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!aimRef.current.active || e.touches.length !== 1) return;
        e.preventDefault();
        const { x: mx, y: my } = getTouchWorldCoords(e.touches[0]);
        const cannon = getMyCannonPos();
        const aim = aimRef.current;
        aim.angle = Math.atan2(cannon.y - my, Math.abs(mx - cannon.x));
        aim.angle = Math.max((10 * Math.PI) / 180, Math.min((170 * Math.PI) / 180, aim.angle));
        const dist = Math.sqrt((mx - cannon.x) ** 2 + (my - cannon.y) ** 2);
        aim.power = Math.max(5, Math.min(50, 5 + (dist / 200) * 45));
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        const aim = aimRef.current;
        if (!aim.active) return;
        e.preventDefault();
        aim.active = false;
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
            className={`border border-white/20 rounded-lg shadow-2xl w-full h-auto touch-none ${cursorClass}`}
            style={{ imageRendering: 'auto' }}
        />
    );
};
