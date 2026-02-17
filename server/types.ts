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

export interface GameState {
    bodies: BodyState[];
    timestamp: number;
    kingHp: number;
    kingMaxHp: number;
}

export interface KingState {
    bodyId: number;
    hp: number;
    maxHp: number;
    position: Vector;
}
