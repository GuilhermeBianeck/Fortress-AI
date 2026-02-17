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
    blockHp: number | null;
    blockMaxHp: number | null;
}

export type GameMode = 'build' | 'fire';
export type MatchPhase = 'lobby' | 'build' | 'reveal' | 'combat' | 'result';
export type Side = 'left' | 'right';

export interface KingHpState {
    hp: number;
    maxHp: number;
}

export interface GameState {
    bodies: BodyState[];
    timestamp: number;
    kings: {
        left: KingHpState;
        right: KingHpState;
    };
}

export interface RoomState {
    roomId: string;
    side: Side;
    phase: MatchPhase;
    opponentConnected: boolean;
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

export const WORLD_WIDTH = 1600;
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const LEFT_CANNON_X = 20;
export const RIGHT_CANNON_X = 1580;
