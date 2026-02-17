import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import type { MaterialType, ShapeType, GameMode, MatchPhase } from '../types';
import { MATERIAL_COLORS } from '../types';

interface GodToolsProps {
    selectedMaterial: MaterialType;
    selectedShape: ShapeType;
    onMaterialChange: (m: MaterialType) => void;
    onShapeChange: (s: ShapeType) => void;
    gameMode: GameMode;
    onModeChange: (m: GameMode) => void;
    phase: MatchPhase;
    onReady: () => void;
}

const MATERIALS: { key: MaterialType; label: string; icon: string }[] = [
    { key: 'wood', label: 'Wood', icon: '🪵' },
    { key: 'stone', label: 'Stone', icon: '🪨' },
    { key: 'steel', label: 'Steel', icon: '⚙️' },
];

const SHAPES: { key: ShapeType; label: string; icon: string }[] = [
    { key: 'rectangle', label: 'Block', icon: '⬜' },
    { key: 'pillar', label: 'Pillar', icon: '▮' },
    { key: 'beam', label: 'Beam', icon: '▬' },
];

export const GodTools = ({
    selectedMaterial,
    selectedShape,
    onMaterialChange,
    onShapeChange,
    gameMode,
    onModeChange,
    phase,
    onReady,
}: GodToolsProps) => {
    const [isReady, setIsReady] = useState(false);

    // Reset ready state when a new build phase starts (new match/round)
    useEffect(() => {
        if (phase === 'build') {
            setIsReady(false);
        }
    }, [phase]);

    // Only show during build phase
    if (phase !== 'build') {
        return null;
    }

    const handleReady = () => {
        if (isReady) return;
        setIsReady(true);
        onReady();
    };

    return (
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 w-full">
            {/* Mode Toggle */}
            <div className="flex items-center bg-black/60 border border-white/10 rounded-lg p-0.5 sm:p-1 backdrop-blur-sm">
                <button
                    onClick={() => onModeChange('build')}
                    className={`
                        min-h-[36px] sm:min-h-0 px-3 sm:px-3 py-1.5 sm:py-1.5 rounded-md text-xs sm:text-xs font-bold
                        transition-colors duration-200 touch-manipulation
                        ${gameMode === 'build'
                            ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
                            : 'text-neutral-500 hover:text-neutral-300 active:text-white hover:bg-white/5 active:bg-white/10'
                        }
                    `}
                >
                    BUILD
                </button>
                <button
                    onClick={() => onModeChange('fire')}
                    className={`
                        min-h-[36px] sm:min-h-0 px-3 sm:px-3 py-1.5 sm:py-1.5 rounded-md text-xs sm:text-xs font-bold
                        transition-colors duration-200 touch-manipulation
                        ${gameMode === 'fire'
                            ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30'
                            : 'text-neutral-500 hover:text-neutral-300 active:text-white hover:bg-white/5 active:bg-white/10'
                        }
                    `}
                >
                    PREVIEW
                </button>
            </div>

            {gameMode === 'build' ? (
                <>
                    {/* Material Selector */}
                    <div className="flex items-center gap-0.5 sm:gap-1.5 bg-black/60 border border-white/10 rounded-lg p-0.5 sm:p-1.5 backdrop-blur-sm">
                        {MATERIALS.map(mat => (
                            <button
                                key={mat.key}
                                onClick={() => onMaterialChange(mat.key)}
                                className={`
                                    flex items-center gap-1 sm:gap-1.5 min-h-[36px] sm:min-h-0 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-xs sm:text-xs font-medium
                                    transition-colors duration-150 touch-manipulation
                                    ${selectedMaterial === mat.key
                                        ? 'bg-white/15 text-white shadow-inner ring-1 ring-white/20'
                                        : 'text-neutral-400 hover:text-white active:text-white hover:bg-white/5 active:bg-white/10'
                                    }
                                `}
                                title={mat.label}
                            >
                                <span className="text-sm">{mat.icon}</span>
                                <span className="hidden sm:inline">{mat.label}</span>
                                <span
                                    className={`w-2.5 h-2.5 rounded-full border transition-colors duration-150 ${
                                        selectedMaterial === mat.key ? 'border-white/40 ring-1 ring-white/20' : 'border-white/20'
                                    }`}
                                    style={{ backgroundColor: MATERIAL_COLORS[mat.key] }}
                                />
                            </button>
                        ))}
                    </div>

                    {/* Shape Selector */}
                    <div className="flex items-center gap-0.5 sm:gap-1.5 bg-black/60 border border-white/10 rounded-lg p-0.5 sm:p-1.5 backdrop-blur-sm">
                        {SHAPES.map(shape => (
                            <button
                                key={shape.key}
                                onClick={() => onShapeChange(shape.key)}
                                className={`
                                    flex items-center gap-1 sm:gap-1.5 min-h-[36px] sm:min-h-0 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-xs sm:text-xs font-medium
                                    transition-colors duration-150 touch-manipulation
                                    ${selectedShape === shape.key
                                        ? 'bg-white/15 text-white shadow-inner ring-1 ring-white/20'
                                        : 'text-neutral-400 hover:text-white active:text-white hover:bg-white/5 active:bg-white/10'
                                    }
                                `}
                                title={shape.label}
                            >
                                <span className="text-sm">{shape.icon}</span>
                                <span className="hidden sm:inline">{shape.label}</span>
                            </button>
                        ))}
                    </div>
                </>
            ) : (
                <div className="flex items-center gap-2 bg-black/60 border border-white/10 rounded-lg px-3 sm:px-3 py-1.5 sm:py-1.5 backdrop-blur-sm">
                    <span className="text-xs sm:text-xs font-medium text-neutral-400">Preview mode</span>
                </div>
            )}

            {/* Ready / Done Button — hidden on mobile (shown separately as overlay) */}
            <button
                onClick={handleReady}
                disabled={isReady}
                className={`hidden sm:flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold
                    transition-colors duration-200 touch-manipulation ml-auto border
                    ${isReady
                        ? 'bg-emerald-600/40 text-emerald-200 border-emerald-400/50 ring-1 ring-emerald-400/30 cursor-default'
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30 hover:text-emerald-300 active:bg-emerald-500/40 cursor-pointer'
                    }`}
            >
                {isReady ? <Check size={12} /> : null}
                {isReady ? 'READY!' : 'DONE'}
            </button>
        </div>
    );
};

// Separate mobile Done button component (rendered as top overlay)
export const MobileDoneButton = ({ phase, onReady }: { phase: MatchPhase; onReady: () => void }) => {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        if (phase === 'build') {
            setIsReady(false);
        }
    }, [phase]);

    if (phase !== 'build') return null;

    const handleReady = () => {
        if (isReady) return;
        setIsReady(true);
        onReady();
    };

    return (
        <button
            onClick={handleReady}
            disabled={isReady}
            className={`flex items-center gap-1.5 min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-bold
                transition-colors duration-200 touch-manipulation border
                ${isReady
                    ? 'bg-emerald-600/40 text-emerald-200 border-emerald-400/50 ring-1 ring-emerald-400/30 cursor-default'
                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 active:bg-emerald-500/40 cursor-pointer'
                }`}
        >
            {isReady ? <Check size={12} /> : null}
            {isReady ? 'READY!' : 'DONE'}
        </button>
    );
};
