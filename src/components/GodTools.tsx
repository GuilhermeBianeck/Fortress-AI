import { useState } from 'react';
import { Eye, Hammer, Check, Square, RectangleVertical, RectangleHorizontal, ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MaterialType, ShapeType, GameMode, MatchPhase } from '../types';
import { MATERIAL_COLORS } from '../types';
import { track } from '../analytics/tracker';

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
    serverReady?: boolean;
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

const SHAPES: { key: ShapeType; label: string; icon: LucideIcon }[] = [
    { key: 'rectangle', label: 'Block', icon: Square },
    { key: 'pillar', label: 'Pillar', icon: RectangleVertical },
    { key: 'beam', label: 'Beam', icon: RectangleHorizontal },
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
    blockCount = 0,
    serverReady = false,
}: GodToolsProps) => {
    const [isReady, setIsReady] = useState(false);
    const ready = isReady || serverReady;

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
        if (ready) return;
        track('build_phase_skipped');
        setIsReady(true);
        onReady();
    };

    return (
        <div className="game-build-tools">
            <div className="game-build-modes" role="group" aria-label="Fortress interaction mode">
                <button
                    type="button"
                    onClick={() => onModeChange('build')}
                    aria-pressed={gameMode === 'build'}
                    title="Build fortress"
                >
                    <Hammer size={16} aria-hidden="true" />
                    Build
                </button>
                <button
                    type="button"
                    // The existing 'fire' mode only inspects while the phase is 'build'.
                    onClick={() => onModeChange('fire')}
                    aria-pressed={gameMode === 'fire'}
                    title="Inspect battlefield"
                >
                    <Eye size={16} aria-hidden="true" />
                    Inspect
                </button>
            </div>

            <div className="game-build-pickers">
                <label>Material
                    <select aria-label="Block material" value={selectedMaterial} disabled={gameMode !== 'build'} onChange={e => {
                        const value = e.target.value as MaterialType;
                        track('material_selected', { material: value }); onMaterialChange(value);
                    }}>
                        {MATERIALS.map(material => <option key={material.key} value={material.key}>{material.label}</option>)}
                    </select>
                    <ChevronDown size={16} aria-hidden="true" />
                </label>
                <label>Shape
                    <select aria-label="Block shape" value={selectedShape} disabled={gameMode !== 'build'} onChange={e => {
                        const value = e.target.value as ShapeType;
                        track('shape_selected', { shape: value }); onShapeChange(value);
                    }}>
                        {SHAPES.map(shape => <option key={shape.key} value={shape.key}>{shape.label}</option>)}
                    </select>
                    <ChevronDown size={16} aria-hidden="true" />
                </label>
            </div>

            <div className="game-build-options" role="group" aria-label="Block options">
                <div className="game-tool-group" role="group" aria-label="Select material">
                    {MATERIALS.map(mat => {
                        const isActive = selectedMaterial === mat.key;
                        const matColor = MATERIAL_COLORS[mat.key];
                        return (
                            <button
                                key={mat.key}
                                type="button"
                                onClick={() => { track('material_selected', { material: mat.key }); onMaterialChange(mat.key); }}
                                disabled={gameMode !== 'build'}
                                aria-pressed={isActive}
                                aria-label={mat.label}
                                title={MATERIAL_TIPS[mat.key]}
                                className="game-tool-button"
                                data-material={mat.key}
                            >
                                <span
                                    aria-hidden="true"
                                    className="game-material-swatch"
                                    style={{ backgroundColor: matColor }}
                                />
                            </button>
                        );
                    })}
                </div>

                <div className="game-tool-group game-shape-group" role="group" aria-label="Select block shape">
                    {SHAPES.map(shape => {
                        const isActive = selectedShape === shape.key;
                        const Icon = shape.icon;
                        return (
                            <button
                                key={shape.key}
                                type="button"
                                onClick={() => { track('shape_selected', { shape: shape.key }); onShapeChange(shape.key); }}
                                disabled={gameMode !== 'build'}
                                aria-pressed={isActive}
                                aria-label={shape.label}
                                title={shape.label}
                                className="game-tool-button"
                                data-shape={shape.key}
                            >
                                <Icon size={24} aria-hidden="true" />
                            </button>
                        );
                    })}
                </div>
                {blockCount > 0 && (
                    <div aria-label={`${blockCount} blocks placed`} className="game-block-count">
                        <span className="font-mono font-bold text-[var(--gold)]">{blockCount}</span>
                        <span aria-hidden="true">blocks</span>
                    </div>
                )}
            </div>

            <button
                type="button"
                onClick={handleReady}
                disabled={ready}
                aria-label={ready ? 'Ready for battle' : 'Done building, ready for battle'}
                className={`game-build-done ${ready ? 'game-build-ready' : 'btn-emerald'}`}
            >
                <Check size={16} aria-hidden="true" />
                {ready ? 'READY!' : 'DONE'}
            </button>
        </div>
    );
};
