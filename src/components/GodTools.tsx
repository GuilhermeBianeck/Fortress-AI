import { useState } from 'react';
import { Eye, Check } from 'lucide-react';
import type { MaterialType, ShapeType, GameMode, MatchPhase } from '../types';
import { MATERIAL_COLORS } from '../types';
import { track } from '../analytics/tracker';
import { SpriteIcon } from './SpriteIcon';

interface GodToolsProps {
    selectedMaterial: MaterialType;
    selectedShape: ShapeType;
    onMaterialChange: (m: MaterialType) => void;
    onShapeChange: (s: ShapeType) => void;
    gameMode: GameMode;
    onModeChange: (m: GameMode) => void;
    phase: MatchPhase;
    onReady: () => void;
    blockCount?: number;
}

const MATERIALS: { key: MaterialType; label: string }[] = [
    { key: 'wood', label: 'Wood' },
    { key: 'stone', label: 'Stone' },
    { key: 'ice', label: 'Ice' },
    { key: 'rubber', label: 'Rubber' },
    { key: 'steel', label: 'Steel' },
];

const MATERIAL_TIPS: Record<MaterialType, string> = {
    wood: 'Wood · 30 HP · High friction',
    stone: 'Stone · 80 HP · Heavy',
    ice: 'Ice · 15 HP · Slippery',
    rubber: 'Rubber · 40 HP · Bouncy',
    steel: 'Steel · 200 HP · Dense',
};

const SHAPES: { key: ShapeType; label: string }[] = [
    { key: 'rectangle', label: 'Block' },
    { key: 'pillar', label: 'Pillar' },
    { key: 'beam', label: 'Beam' },
];

const getShapeSpriteName = (shape: ShapeType, material: MaterialType) => {
    if (shape === 'rectangle') return `block_${material}`;
    if (shape === 'pillar') return `shape_pillar_${material}`;
    return `shape_beam_${material}`;
};

export const GodTools = ({
    selectedMaterial,
    selectedShape,
    onMaterialChange,
    onShapeChange,
    gameMode,
    onModeChange,
    phase,
    onReady,
    blockCount = 0,
}: GodToolsProps) => {
    const [isReady, setIsReady] = useState(false);

    // Reset ready state when a new build phase starts.
    // Pattern: store previous phase in state; check during render (React docs: "Adjusting some state when a prop changes").
    const [prevPhase, setPrevPhase] = useState(phase);
    if (prevPhase !== phase) {
        setPrevPhase(phase);
        if (phase === 'build' && isReady) {
            setIsReady(false);
        }
    }

    // Only show during build phase
    if (phase !== 'build') {
        return null;
    }

    const handleReady = () => {
        if (isReady) return;
        track('build_phase_skipped');
        setIsReady(true);
        onReady();
    };

    return (
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-3 w-full">
            {/* Mode Toggle - Mobile Only */}
            <div className="flex items-center border border-[var(--border-subtle)] rounded-lg p-0.5 sm:p-1 backdrop-blur-sm sm:hidden" style={{ background: 'var(--bg-card)' }} role="group" aria-label="Build mode">
                <button
                    onClick={() => onModeChange('build')}
                    aria-pressed={gameMode === 'build'}
                    className={`
                        min-h-[36px] px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5
                        transition-all duration-200 touch-manipulation
                        ${gameMode === 'build'
                            ? 'bg-[rgba(39,174,96,0.2)] text-[var(--emerald)] ring-1 ring-[rgba(39,174,96,0.4)]'
                            : 'text-[var(--text-muted)] active:text-[var(--text-secondary)]'
                        }
                    `}
                >
                    <SpriteIcon name="ui_ready_shield" size={16} />
                    BUILD
                </button>
            </div>

            {gameMode === 'build' ? (
                <>
                    {/* Material Selector — Color Swatches */}
                    <div className="flex items-center gap-0.5 sm:gap-1 border border-[var(--border-subtle)] rounded-xl p-1 sm:p-1.5 backdrop-blur-sm" style={{ background: 'var(--bg-card)' }} role="group" aria-label="Select material">
                        {MATERIALS.map(mat => {
                            const isActive = selectedMaterial === mat.key;
                            const matColor = MATERIAL_COLORS[mat.key];
                            return (
                                <button
                                    key={mat.key}
                                    onClick={() => { track('material_selected', { material: mat.key }); onMaterialChange(mat.key); }}
                                    aria-pressed={isActive}
                                    aria-label={MATERIAL_TIPS[mat.key]}
                                    className={`
                                        flex items-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold
                                        transition-all duration-200 touch-manipulation relative
                                        ${isActive
                                            ? 'text-white shadow-lg material-selected'
                                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] active:text-[var(--text-primary)]'
                                        }
                                    `}
                                    style={isActive ? {
                                        background: `linear-gradient(135deg, ${matColor}33, ${matColor}15)`,
                                        boxShadow: `0 0 12px ${matColor}40, inset 0 0 8px ${matColor}20`,
                                        border: `1.5px solid ${matColor}80`,
                                    } : {
                                        border: '1.5px solid transparent',
                                    }}
                                >
                                    <SpriteIcon name={`block_${mat.key}`} size={22} />
                                    <span className="sr-only">{mat.label}</span>
                                    <span
                                        aria-hidden="true"
                                        className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${isActive ? 'ring-2 ring-white/40 scale-110' : ''}`}
                                        style={{ backgroundColor: matColor, boxShadow: isActive ? `0 0 8px ${matColor}` : 'none' }}
                                    />
                                </button>
                            );
                        })}
                    </div>

                    {/* Shape Selector — SVG Previews */}
                    <div className="flex items-center gap-0.5 sm:gap-1 border border-[var(--border-subtle)] rounded-xl p-1 sm:p-1.5 backdrop-blur-sm" style={{ background: 'var(--bg-card)' }} role="group" aria-label="Select block shape">
                        {SHAPES.map(shape => {
                            const isActive = selectedShape === shape.key;
                            return (
                                <button
                                    key={shape.key}
                                    onClick={() => { track('shape_selected', { shape: shape.key }); onShapeChange(shape.key); }}
                                    aria-pressed={isActive}
                                    aria-label={shape.label}
                                    className={`
                                        flex items-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-bold
                                        transition-all duration-200 touch-manipulation
                                        ${isActive
                                            ? `text-[var(--gold)] shadow-lg`
                                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] active:text-[var(--text-primary)]'
                                        }
                                    `}
                                    style={isActive ? {
                                        background: `linear-gradient(135deg, rgba(255, 215, 0, 0.12), rgba(255, 215, 0, 0.04))`,
                                        boxShadow: `0 0 10px rgba(255, 215, 0, 0.15)`,
                                        border: '1.5px solid rgba(255, 215, 0, 0.4)',
                                    } : {
                                        border: '1.5px solid transparent',
                                    }}
                                >
                                    <SpriteIcon
                                        name={getShapeSpriteName(shape.key, selectedMaterial)}
                                        size={shape.key === 'beam' ? 28 : 22}
                                        className={isActive ? '' : 'opacity-70'}
                                    />
                                    <span className="hidden sm:inline" aria-hidden="true">{shape.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </>
            ) : (
                <div className="flex items-center gap-2 border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 backdrop-blur-sm" style={{ background: 'var(--bg-card)' }}>
                    <Eye size={14} className="text-[var(--text-muted)]" aria-hidden="true" />
                    <span className="text-xs font-medium text-[var(--text-muted)]">Preview mode — survey the battlefield</span>
                </div>
            )}

            {/* Block counter badge */}
            {blockCount > 0 && (
                <div
                    aria-label={`${blockCount} blocks placed`}
                    className="flex items-center gap-1 border border-[var(--border-subtle)] rounded-lg px-2 sm:px-2.5 py-1 sm:py-1.5 backdrop-blur-sm" style={{ background: 'var(--bg-card)' }}>
                    <span className="text-[10px] sm:text-xs font-mono font-bold text-[var(--gold)]">{blockCount}</span>
                    <span className="text-[9px] sm:text-[10px] text-[var(--text-muted)] hidden sm:inline">blocks</span>
                    <span aria-hidden="true" className="text-[9px] text-[var(--text-muted)] sm:hidden">blk</span>
                </div>
            )}

            {/* Ready / Done Button — hidden on mobile (shown separately as overlay) */}
            <button
                onClick={handleReady}
                disabled={isReady}
                className={`hidden sm:flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold
                    transition-all duration-200 touch-manipulation border shadow-md
                    ${isReady
                        ? 'card-dark text-[var(--emerald)] border-[rgba(39,174,96,0.3)] cursor-default'
                        : 'btn-emerald cursor-pointer animate-pulse-subtle'
                    }`}
            >
                {isReady ? <Check size={14} /> : <SpriteIcon name="ui_ready_shield" size={16} />}
                {isReady ? 'READY!' : 'DONE'}
            </button>
        </div>
    );
};

// Separate mobile Done button component (rendered as top overlay)
export const MobileDoneButton = ({ phase, onReady }: { phase: MatchPhase; onReady: () => void }) => {
    const [isReady, setIsReady] = useState(false);

    // Reset ready state when build phase restarts.
    // Pattern: store previous phase in state; check during render (React docs: "Adjusting some state when a prop changes").
    const [prevPhase, setPrevPhase] = useState(phase);
    if (prevPhase !== phase) {
        setPrevPhase(phase);
        if (phase === 'build' && isReady) {
            setIsReady(false);
        }
    }

    if (phase !== 'build') return null;

    const handleReady = () => {
        if (isReady) return;
        track('build_phase_skipped');
        setIsReady(true);
        onReady();
    };

    return (
        <button
            onClick={handleReady}
            disabled={isReady}
            aria-label={isReady ? 'Ready for battle' : 'Done building — signal ready to fight'}
            className={`flex items-center gap-1.5 min-h-[44px] px-5 py-2 rounded-xl text-sm font-bold
                transition-all duration-200 touch-manipulation border shadow-lg
                ${isReady
                    ? 'card-dark text-[var(--emerald)] border-[rgba(39,174,96,0.3)] cursor-default'
                    : 'btn-emerald cursor-pointer animate-pulse-subtle'
                }`}
        >
            {isReady ? <Check size={14} aria-hidden="true" /> : <SpriteIcon name="ui_ready_shield" size={16} />}
            {isReady ? 'READY!' : 'DONE'}
        </button>
    );
};
