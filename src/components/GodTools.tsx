import { useState, useEffect } from 'react';
import { Hammer, Eye, Check, Swords } from 'lucide-react';
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
            {/* Mode Toggle - Mobile Only */}
            <div className="flex items-center border border-[var(--border-subtle)] rounded-lg p-0.5 sm:p-1 backdrop-blur-sm sm:hidden" style={{ background: 'var(--bg-card)' }}>
                <button
                    onClick={() => onModeChange('build')}
                    className={`
                        min-h-[36px] px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5
                        transition-colors duration-200 touch-manipulation
                        ${gameMode === 'build'
                            ? 'bg-[rgba(39,174,96,0.2)] text-[var(--emerald)] ring-1 ring-[rgba(39,174,96,0.4)]'
                            : 'text-[var(--text-muted)] active:text-[var(--text-secondary)]'
                        }
                    `}
                >
                    <Hammer size={14} />
                    BUILD
                </button>
                <button
                    onClick={() => onModeChange('fire')}
                    className={`
                        min-h-[36px] px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5
                        transition-colors duration-200 touch-manipulation
                        ${gameMode === 'fire'
                            ? 'bg-[rgba(192,57,43,0.2)] text-[var(--crimson)] ring-1 ring-[rgba(192,57,43,0.4)]'
                            : 'text-[var(--text-muted)] active:text-[var(--text-secondary)]'
                        }
                    `}
                >
                    <Eye size={14} />
                    PREVIEW
                </button>
            </div>

            {gameMode === 'build' ? (
                <>
                    {/* Material Selector */}
                    <div className="flex items-center gap-0.5 sm:gap-1.5 border border-[var(--border-subtle)] rounded-lg p-0.5 sm:p-1.5 backdrop-blur-sm" style={{ background: 'var(--bg-card)' }}>
                        {MATERIALS.map(mat => (
                            <button
                                key={mat.key}
                                onClick={() => onMaterialChange(mat.key)}
                                className={`
                                    flex items-center gap-1 sm:gap-1.5 min-h-[36px] sm:min-h-0 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-xs sm:text-xs font-medium
                                    transition-colors duration-150 touch-manipulation
                                    ${selectedMaterial === mat.key
                                        ? 'bg-[rgba(255,215,0,0.15)] text-[var(--gold)] shadow-inner ring-1 ring-[var(--border-accent)]'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] active:text-[var(--text-primary)]'
                                    }
                                `}
                                title={mat.label}
                            >
                                <span className="text-sm">{mat.icon}</span>
                                <span className="hidden sm:inline">{mat.label}</span>
                                <span
                                    className={`w-2.5 h-2.5 rounded-full border transition-colors duration-150 ${selectedMaterial === mat.key ? 'border-[var(--gold-dim)] ring-1 ring-[var(--gold-glow)]' : 'border-[var(--text-muted)]'
                                        }`}
                                    style={{ backgroundColor: MATERIAL_COLORS[mat.key] }}
                                />
                            </button>
                        ))}
                    </div>

                    {/* Shape Selector */}
                    <div className="flex items-center gap-0.5 sm:gap-1.5 border border-[var(--border-subtle)] rounded-lg p-0.5 sm:p-1.5 backdrop-blur-sm" style={{ background: 'var(--bg-card)' }}>
                        {SHAPES.map(shape => (
                            <button
                                key={shape.key}
                                onClick={() => onShapeChange(shape.key)}
                                className={`
                                    flex items-center gap-1 sm:gap-1.5 min-h-[36px] sm:min-h-0 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-xs sm:text-xs font-medium
                                    transition-colors duration-150 touch-manipulation
                                    ${selectedShape === shape.key
                                        ? 'bg-[rgba(255,215,0,0.15)] text-[var(--gold)] shadow-inner ring-1 ring-[var(--border-accent)]'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] active:text-[var(--text-primary)]'
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
                <div className="flex items-center gap-2 border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 backdrop-blur-sm" style={{ background: 'var(--bg-card)' }}>
                    <Eye size={14} className="text-[var(--text-muted)]" />
                    <span className="text-xs font-medium text-[var(--text-muted)]">Preview mode — survey the battlefield</span>
                </div>
            )}

            {/* Ready / Done Button — hidden on mobile (shown separately as overlay) */}
            <button
                onClick={handleReady}
                disabled={isReady}
                className={`hidden sm:flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold
                    transition-all duration-200 touch-manipulation border shadow-md
                    ${isReady
                        ? 'card-dark text-[var(--emerald)] border-[rgba(39,174,96,0.3)] cursor-default'
                        : 'btn-emerald cursor-pointer'
                    }`}
            >
                {isReady ? <Check size={12} /> : <Swords size={12} />}
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
                transition-all duration-200 touch-manipulation border shadow-md
                ${isReady
                    ? 'card-dark text-[var(--emerald)] border-[rgba(39,174,96,0.3)] cursor-default'
                    : 'btn-emerald cursor-pointer'
                }`}
        >
            {isReady ? <Check size={12} /> : <Swords size={12} />}
            {isReady ? 'READY!' : 'DONE'}
        </button>
    );
};
