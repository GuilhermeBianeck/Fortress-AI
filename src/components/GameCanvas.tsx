import { useEffect, useRef, useCallback } from 'react';
import type { GameState, TerrainData, GameMode, Vector } from '../types';
import { ParticleSystem } from '../effects/particles';

interface GameCanvasProps {
    gameState: GameState | null;
    terrain: TerrainData | null;
    onSpawn: (x: number, y: number) => void;
    kingHp: number;
    kingMaxHp: number;
    gameMode: GameMode;
    onFire: (angle: number, power: number) => void;
    setBlockDestroyedCallback: (cb: ((data: { bodyId: number; position: Vector; material: string; velocity: Vector }) => void) | null) => void;
    setProjectileImpactCallback: (cb: ((data: { position: Vector }) => void) | null) => void;
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
    gameState, terrain, onSpawn, kingHp, kingMaxHp,
    gameMode, onFire,
    setBlockDestroyedCallback, setProjectileImpactCallback,
}: GameCanvasProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Persistent state in refs (no re-render thrashing)
    const gameStateRef = useRef(gameState);
    const terrainRef = useRef(terrain);
    const kingHpRef = useRef(kingHp);
    const kingMaxHpRef = useRef(kingMaxHp);
    const gameModeRef = useRef(gameMode);
    const onSpawnRef = useRef(onSpawn);
    const onFireRef = useRef(onFire);

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

    // Previous king HP for shake detection
    const prevKingHpRef = useRef(kingHp);

    // Animation frame ID
    const rafRef = useRef<number>(0);

    // Sync refs
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
    useEffect(() => { terrainRef.current = terrain; }, [terrain]);
    useEffect(() => { kingHpRef.current = kingHp; }, [kingHp]);
    useEffect(() => { kingMaxHpRef.current = kingMaxHp; }, [kingMaxHp]);
    useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);
    useEffect(() => { onSpawnRef.current = onSpawn; }, [onSpawn]);
    useEffect(() => { onFireRef.current = onFire; }, [onFire]);

    // Detect King HP decrease -> shake
    useEffect(() => {
        if (kingHp < prevKingHpRef.current) {
            triggerShake(6, 18);
        }
        prevKingHpRef.current = kingHp;
    }, [kingHp]);

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
        const kHp = kingHpRef.current;
        const kMaxHp = kingMaxHpRef.current;
        const mode = gameModeRef.current;
        const aim = aimRef.current;
        const shake = shakeRef.current;
        const particles = particlesRef.current;

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

        // Draw stars
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        for (let i = 0; i < 40; i++) {
            const sx = (i * 137.5) % canvas.width;
            const sy = (i * 73.7) % (canvas.height * 0.5);
            const size = (i % 3 === 0) ? 1.5 : 1;
            ctx.beginPath();
            ctx.arc(sx, sy, size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw terrain
        if (terr && terr.points.length > 0) {
            ctx.beginPath();
            ctx.moveTo(0, canvas.height);
            for (const pt of terr.points) {
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.lineTo(canvas.width, canvas.height);
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
        }

        // Draw cannon (fire mode only)
        if (mode === 'fire' && terr && terr.points.length > 0) {
            const cannonX = 20;
            const cannonY = interpolateTerrainY(terr.points, cannonX) - 20;

            // Barrel
            ctx.save();
            ctx.translate(cannonX, cannonY);
            ctx.rotate(-aim.angle);
            ctx.fillStyle = '#333';
            ctx.fillRect(0, -4, 24, 8);
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 1;
            ctx.strokeRect(0, -4, 24, 8);
            ctx.restore();

            // Base
            ctx.beginPath();
            ctx.arc(cannonX, cannonY, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#444';
            ctx.fill();
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Trajectory preview (while aiming)
            if (aim.active || aim.useKeyboard) {
                const dt = 1000 / 60 / 1000; // seconds per tick
                const gravity = 2;
                let px = cannonX + Math.cos(aim.angle) * 24;
                let py = cannonY - Math.sin(aim.angle) * 24;
                let vx = aim.power * Math.cos(aim.angle);
                let vy = -aim.power * Math.sin(aim.angle);

                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                for (let step = 0; step < 15; step++) {
                    px += vx;
                    py += vy;
                    vy += gravity * (1000 / 60 / 1000) * 60;
                    ctx.beginPath();
                    ctx.arc(px, py, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // Keyboard readout
            if (aim.useKeyboard) {
                ctx.font = 'bold 10px monospace';
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'left';
                ctx.fillText(`${(aim.angle * 180 / Math.PI).toFixed(0)}° P:${aim.power.toFixed(0)}`, cannonX + 12, cannonY - 18);
            }
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
                if (body.label === 'Terrain') continue;

                ctx.save();
                ctx.translate(body.position.x, body.position.y);
                ctx.rotate(body.angle);

                const fillColor = body.color || MATERIAL_COLORS[body.material] || MATERIAL_COLORS[body.label] || '#e11d48';
                const strokeColor = MATERIAL_STROKE[body.material] || MATERIAL_STROKE[body.label] || 'rgba(255,255,255,0.3)';

                ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;

                if (body.circleRadius > 0) {
                    ctx.beginPath();
                    ctx.arc(0, 0, body.circleRadius, 0, Math.PI * 2);
                    ctx.fillStyle = fillColor;
                    ctx.fill();
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    if (body.label === 'king') {
                        ctx.shadowColor = 'transparent';
                        ctx.font = '10px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillStyle = '#FFD700';
                        ctx.fillText('\u265A', 0, 4);
                    }

                    // Projectile glow
                    if (body.label === 'projectile') {
                        ctx.shadowColor = 'transparent';
                        ctx.beginPath();
                        ctx.arc(0, 0, body.circleRadius + 3, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(255, 150, 50, 0.15)';
                        ctx.fill();
                    }
                } else if (!body.isStatic) {
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
                if (body.label === 'king' && kMaxHp > 0) {
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

        // Draw particles (after bodies, before HUD)
        particles.draw(ctx);

        // HUD: King HP bar (top-left corner)
        if (kMaxHp > 0) {
            const hudX = 12;
            const hudY = 12;
            const hudWidth = 120;
            const hudHeight = 14;
            const hpRatio = Math.max(0, kHp / kMaxHp);

            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(hudX - 2, hudY - 2, hudWidth + 4, hudHeight + 18);

            ctx.font = 'bold 10px monospace';
            ctx.fillStyle = '#FFD700';
            ctx.textAlign = 'left';
            ctx.fillText('\u265A KING', hudX, hudY + 10);

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
            ctx.fillText(`${Math.ceil(kHp)} / ${kMaxHp}`, hudX + hudWidth / 2, barY + 11);
        }

        // HUD: Mode indicator (top-right)
        {
            const modeLabel = mode === 'fire' ? 'FIRE MODE' : 'BUILD MODE';
            const modeColor = mode === 'fire' ? '#ef4444' : '#22c55e';
            ctx.font = 'bold 10px monospace';
            ctx.fillStyle = modeColor;
            ctx.textAlign = 'right';
            ctx.fillText(modeLabel, canvas.width - 12, 22);
        }

        ctx.restore();
    };

    // Mouse coordinate helper
    const getCanvasCoords = (e: React.MouseEvent): { x: number; y: number } => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    };

    // Cannon position helper
    const getCannonPos = (): { x: number; y: number } => {
        const terr = terrainRef.current;
        if (!terr || terr.points.length === 0) return { x: 20, y: 480 };
        return { x: 20, y: interpolateTerrainY(terr.points, 20) - 20 };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (gameModeRef.current === 'build') {
            const { x, y } = getCanvasCoords(e);
            onSpawnRef.current(x, y);
            return;
        }

        // Fire mode: start aiming
        const aim = aimRef.current;
        aim.active = true;
        aim.useKeyboard = false;
        const { x: mx, y: my } = getCanvasCoords(e);
        const cannon = getCannonPos();
        aim.angle = Math.atan2(cannon.y - my, mx - cannon.x);
        aim.angle = Math.max((10 * Math.PI) / 180, Math.min((170 * Math.PI) / 180, aim.angle));
        const dist = Math.sqrt((mx - cannon.x) ** 2 + (my - cannon.y) ** 2);
        aim.power = Math.max(5, Math.min(30, dist / 10));
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!aimRef.current.active) return;
        const { x: mx, y: my } = getCanvasCoords(e);
        const cannon = getCannonPos();
        const aim = aimRef.current;
        aim.angle = Math.atan2(cannon.y - my, mx - cannon.x);
        aim.angle = Math.max((10 * Math.PI) / 180, Math.min((170 * Math.PI) / 180, aim.angle));
        const dist = Math.sqrt((mx - cannon.x) ** 2 + (my - cannon.y) ** 2);
        aim.power = Math.max(5, Math.min(30, dist / 10));
    };

    const handleMouseUp = () => {
        const aim = aimRef.current;
        if (!aim.active) return;
        aim.active = false;
        onFireRef.current(aim.angle, aim.power);
    };

    // Keyboard controls for fire mode
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (gameModeRef.current !== 'fire') return;
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

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
                    aim.power = Math.min(30, aim.power + 1);
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
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

    const cursorClass = gameMode === 'fire' ? 'cursor-default' : 'cursor-crosshair';

    return (
        <canvas
            ref={canvasRef}
            width={800}
            height={600}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`border border-white/20 rounded-lg shadow-2xl ${cursorClass}`}
            style={{ imageRendering: 'auto' }}
        />
    );
};
