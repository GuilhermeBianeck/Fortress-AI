import { useEffect, useRef } from 'react';
import type { GameState, TerrainData } from '../types';

interface GameCanvasProps {
    gameState: GameState | null;
    terrain: TerrainData | null;
    onSpawn: (x: number, y: number) => void;
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

export const GameCanvas = ({ gameState, terrain, onSpawn }: GameCanvasProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear with gradient background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGrad.addColorStop(0, '#0a0a1a');
        bgGrad.addColorStop(0.6, '#0f0f2e');
        bgGrad.addColorStop(1, '#1a1a3e');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw stars (simple dots)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        for (let i = 0; i < 40; i++) {
            // Deterministic star positions based on index
            const sx = (i * 137.5) % canvas.width;
            const sy = (i * 73.7) % (canvas.height * 0.5);
            const size = (i % 3 === 0) ? 1.5 : 1;
            ctx.beginPath();
            ctx.arc(sx, sy, size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw terrain
        if (terrain && terrain.points.length > 0) {
            ctx.beginPath();
            ctx.moveTo(0, canvas.height);

            for (const pt of terrain.points) {
                ctx.lineTo(pt.x, pt.y);
            }

            ctx.lineTo(canvas.width, canvas.height);
            ctx.closePath();

            // Terrain gradient
            const terrainGrad = ctx.createLinearGradient(0, 400, 0, canvas.height);
            terrainGrad.addColorStop(0, '#2a3a2a');
            terrainGrad.addColorStop(0.3, '#1f2f1f');
            terrainGrad.addColorStop(1, '#0a150a');
            ctx.fillStyle = terrainGrad;
            ctx.fill();

            // Terrain top edge highlight
            ctx.beginPath();
            ctx.moveTo(terrain.points[0].x, terrain.points[0].y);
            for (let i = 1; i < terrain.points.length; i++) {
                ctx.lineTo(terrain.points[i].x, terrain.points[i].y);
            }
            ctx.strokeStyle = 'rgba(100, 200, 100, 0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw build zones (subtle indicators)
            for (const zone of terrain.buildZones) {
                ctx.fillStyle = 'rgba(100, 200, 100, 0.05)';
                ctx.fillRect(zone.x, zone.y - 100, zone.width, 100);

                // Zone top marker
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

        // Draw dynamic bodies
        if (!gameState) return;

        for (const body of gameState.bodies) {
            // Skip terrain (drawn separately above)
            if (body.label === 'Terrain') continue;

            ctx.save();
            ctx.translate(body.position.x, body.position.y);
            ctx.rotate(body.angle);

            const fillColor = body.color || MATERIAL_COLORS[body.material] || MATERIAL_COLORS[body.label] || '#e11d48';
            const strokeColor = MATERIAL_STROKE[body.material] || MATERIAL_STROKE[body.label] || 'rgba(255,255,255,0.3)';

            // Shadow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;

            if (body.circleRadius > 0) {
                // Draw circle
                ctx.beginPath();
                ctx.arc(0, 0, body.circleRadius, 0, Math.PI * 2);
                ctx.fillStyle = fillColor;
                ctx.fill();
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            } else if (!body.isStatic) {
                // Draw rectangle for dynamic bodies
                const w = body.width || 50;
                const h = body.height || 50;
                ctx.fillStyle = fillColor;
                ctx.fillRect(-w / 2, -h / 2, w, h);
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = 1.5;
                ctx.strokeRect(-w / 2, -h / 2, w, h);

                // Inner highlight (glass effect)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h / 3);
            }

            ctx.restore();
        }

    }, [gameState, terrain]);

    const handleClick = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        // Scale from CSS pixel space to canvas internal resolution
        const scaleX = canvasRef.current.width / rect.width;
        const scaleY = canvasRef.current.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        onSpawn(x, y);
    };

    return (
        <canvas
            ref={canvasRef}
            width={800}
            height={600}
            onClick={handleClick}
            className="border border-white/20 rounded-lg shadow-2xl cursor-crosshair"
            style={{ imageRendering: 'auto' }}
        />
    );
};
