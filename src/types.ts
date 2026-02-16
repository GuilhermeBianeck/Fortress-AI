export interface Vector {
    x: number;
    y: number;
}

export interface BodyState {
    id: number;
    position: Vector;
    angle: number;
    velocity: Vector;
    label: string;
    isStatic: boolean;
    width: number;
    height: number;
    circleRadius: number;
    material: string;
    color: string;
}

export interface GameState {
    bodies: BodyState[];
    timestamp: number;
    kingHp: number;
    kingMaxHp: number;
}

export interface TerrainData {
    points: { x: number; y: number }[];
    buildZones: { x: number; width: number; y: number }[];
    seed: number;
}

export interface BuildStatus {
    status: 'idle' | 'generating' | 'building' | 'success' | 'error';
    message: string;
}

export type MaterialType = 'wood' | 'stone' | 'ice' | 'rubber' | 'steel';
export type ShapeType = 'rectangle' | 'circle';

export const MATERIAL_COLORS: Record<MaterialType, string> = {
    wood: '#A67C52',
    stone: '#7D7D7D',
    ice: '#A5F2F3',
    rubber: '#FF69B4',
    steel: '#434B4D',
};
