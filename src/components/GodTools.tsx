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
        <div className="flex flex-wrap items-center gap-1 sm:gap-3 w-full">
            {/* Mode Toggle */}
            <div className="flex items-center bg-[#2d1f0e]/60 border border-amber-900/30 rounded-lg p-0.5 sm:p-1 backdrop-blur-sm">
                <button
                    onClick={() => onModeChange('build')}
                    className={`
                        px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-bold
                        transition-colors duration-200 touch-manipulation
                        ${gameMode === 'build'
                            ? 'bg-green-800/30 text-green-400 ring-1 ring-green-700/40'
                            : 'text-amber-700 hover:text-amber-400 active:text-amber-200 hover:bg-amber-900/20 active:bg-amber-900/30'
                        }
                    `}
                >
                    🔨 BUILD
                </button>
                <button
                    onClick={() => onModeChange('fire')}
                    className={`
                        px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-bold
                        transition-colors duration-200 touch-manipulation
                        ${gameMode === 'fire'
                            ? 'bg-red-900/30 text-red-400 ring-1 ring-red-800/40'
                            : 'text-amber-700 hover:text-amber-400 active:text-amber-200 hover:bg-amber-900/20 active:bg-amber-900/30'
                        }
                    `}
                >
                    🔭 PREVIEW
                </button>
            </div>

            {gameMode === 'build' ? (
                <>
                    {/* Material Selector */}
                    <div className="flex items-center gap-0.5 sm:gap-1.5 bg-[#2d1f0e]/60 border border-amber-900/30 rounded-lg p-0.5 sm:p-1.5 backdrop-blur-sm">
                        {MATERIALS.map(mat => (
                            <button
                                key={mat.key}
                                onClick={() => onMaterialChange(mat.key)}
                                className={`
                                    flex items-center gap-0.5 sm:gap-1.5 px-1 sm:px-2.5 py-0.5 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-medium
                                    transition-colors duration-150 touch-manipulation
                                    ${selectedMaterial === mat.key
                                        ? 'bg-amber-800/30 text-amber-100 shadow-inner ring-1 ring-amber-700/30'
                                        : 'text-amber-600 hover:text-amber-200 active:text-amber-100 hover:bg-amber-900/20 active:bg-amber-900/30'
                                    }
                                `}
                                title={mat.label}
                            >
                                <span className="text-xs sm:text-sm">{mat.icon}</span>
                                <span className="hidden sm:inline">{mat.label}</span>
                                <span
                                    className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full border transition-colors duration-150 ${
                                        selectedMaterial === mat.key ? 'border-amber-400/40 ring-1 ring-amber-400/20' : 'border-amber-800/30'
                                    }`}
                                    style={{ backgroundColor: MATERIAL_COLORS[mat.key] }}
                                />
                            </button>
                        ))}
                    </div>

                    {/* Shape Selector */}
                    <div className="flex items-center gap-0.5 sm:gap-1.5 bg-[#2d1f0e]/60 border border-amber-900/30 rounded-lg p-0.5 sm:p-1.5 backdrop-blur-sm">
                        {SHAPES.map(shape => (
                            <button
                                key={shape.key}
                                onClick={() => onShapeChange(shape.key)}
                                className={`
                                    flex items-center gap-0.5 sm:gap-1.5 px-1 sm:px-2.5 py-0.5 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-medium
                                    transition-colors duration-150 touch-manipulation
                                    ${selectedShape === shape.key
                                        ? 'bg-amber-800/30 text-amber-100 shadow-inner ring-1 ring-amber-700/30'
                                        : 'text-amber-600 hover:text-amber-200 active:text-amber-100 hover:bg-amber-900/20 active:bg-amber-900/30'
                                    }
                                `}
                                title={shape.label}
                            >
                                <span className="text-xs sm:text-sm">{shape.icon}</span>
                                <span className="hidden sm:inline">{shape.label}</span>
                            </button>
                        ))}
                    </div>
                </>
            ) : (
                <div className="flex items-center gap-2 bg-[#2d1f0e]/60 border border-amber-900/30 rounded-lg px-2 sm:px-3 py-0.5 sm:py-1.5 backdrop-blur-sm">
                    <span className="text-[10px] sm:text-xs font-medium text-amber-700">Preview mode — survey the battlefield</span>
                </div>
            )}

            {/* Ready / Done Button — hidden on mobile (shown separately as overlay) */}
            <button
                onClick={handleReady}
                disabled={isReady}
                className={`hidden sm:flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold
                    transition-colors duration-200 touch-manipulation ml-auto border shadow-md
                    ${isReady
                        ? 'bg-green-800/50 text-green-200 border-green-600/40 ring-1 ring-green-600/30 cursor-default shadow-green-900/20'
                        : 'bg-gradient-to-b from-green-700 to-green-800 text-green-100 border-green-700/40 hover:from-green-600 hover:to-green-700 active:from-green-800 active:to-green-900 cursor-pointer shadow-green-900/20'
                    }`}
            >
                {isReady ? <Check size={12} /> : null}
                {isReady ? '⚔️ READY!' : '✅ DONE'}
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
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold
                transition-colors duration-200 touch-manipulation border shadow-md
                ${isReady
                    ? 'bg-green-800/50 text-green-200 border-green-600/40 ring-1 ring-green-600/30 cursor-default shadow-green-900/20'
                    : 'bg-gradient-to-b from-green-700 to-green-800 text-green-100 border-green-700/40 active:from-green-800 active:to-green-900 cursor-pointer shadow-green-900/20'
                }`}
        >
            {isReady ? <Check size={10} /> : null}
            {isReady ? '⚔️ READY!' : '✅ DONE'}
        </button>
    );
};
