import type { MaterialType, ShapeType } from '../types';
import { MATERIAL_COLORS } from '../types';

interface GodToolsProps {
    selectedMaterial: MaterialType;
    selectedShape: ShapeType;
    onMaterialChange: (m: MaterialType) => void;
    onShapeChange: (s: ShapeType) => void;
    onClear: () => void;
}

const MATERIALS: { key: MaterialType; label: string; icon: string }[] = [
    { key: 'wood', label: 'Wood', icon: '🪵' },
    { key: 'stone', label: 'Stone', icon: '🪨' },
    { key: 'ice', label: 'Ice', icon: '🧊' },
    { key: 'rubber', label: 'Rubber', icon: '🎀' },
    { key: 'steel', label: 'Steel', icon: '⚙️' },
];

const SHAPES: { key: ShapeType; label: string; icon: string }[] = [
    { key: 'rectangle', label: 'Box', icon: '⬜' },
    { key: 'circle', label: 'Ball', icon: '⚪' },
];

export const GodTools = ({
    selectedMaterial,
    selectedShape,
    onMaterialChange,
    onShapeChange,
    onClear,
}: GodToolsProps) => {
    return (
        <div className="flex flex-wrap items-center gap-3 w-full max-w-[800px]">
            {/* Material Selector */}
            <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-lg p-1.5 backdrop-blur-sm">
                {MATERIALS.map(mat => (
                    <button
                        key={mat.key}
                        onClick={() => onMaterialChange(mat.key)}
                        className={`
                            flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
                            transition-all duration-200
                            ${selectedMaterial === mat.key
                                ? 'bg-white/15 text-white shadow-inner ring-1 ring-white/20'
                                : 'text-neutral-400 hover:text-white hover:bg-white/5'
                            }
                        `}
                        title={mat.label}
                    >
                        <span className="text-sm">{mat.icon}</span>
                        <span className="hidden sm:inline">{mat.label}</span>
                        <span
                            className="w-2.5 h-2.5 rounded-full border border-white/20"
                            style={{ backgroundColor: MATERIAL_COLORS[mat.key] }}
                        />
                    </button>
                ))}
            </div>

            {/* Shape Selector */}
            <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-lg p-1.5 backdrop-blur-sm">
                {SHAPES.map(shape => (
                    <button
                        key={shape.key}
                        onClick={() => onShapeChange(shape.key)}
                        className={`
                            flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
                            transition-all duration-200
                            ${selectedShape === shape.key
                                ? 'bg-white/15 text-white shadow-inner ring-1 ring-white/20'
                                : 'text-neutral-400 hover:text-white hover:bg-white/5'
                            }
                        `}
                        title={shape.label}
                    >
                        <span className="text-sm">{shape.icon}</span>
                        <span>{shape.label}</span>
                    </button>
                ))}
            </div>

            {/* Clear Button */}
            <button
                onClick={onClear}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                           bg-red-500/10 text-red-400 border border-red-500/20
                           hover:bg-red-500/20 hover:text-red-300 transition-all duration-200 ml-auto"
            >
                <span>🗑</span>
                <span>Clear</span>
            </button>
        </div>
    );
};
