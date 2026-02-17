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
    blockHp: number | null;
    blockMaxHp: number | null;
}

export type Side = 'left' | 'right';
export type MatchPhase = 'lobby' | 'build' | 'reveal' | 'combat' | 'result';

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

export interface KingState {
    bodyId: number;
    hp: number;
    maxHp: number;
    position: Vector;
}

export interface PlayerInfo {
    socketId: string;
    side: Side;
    ready: boolean;
}

export interface PlayerState {
    socketId: string;
    side: Side;
    kingBody: import('matter-js').Body;
    kingState: KingState;
    cannonX: number;
    buildZone: { xMin: number; xMax: number };
}
