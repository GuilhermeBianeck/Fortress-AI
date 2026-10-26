// Combat tuning shared by the server simulation, the bot planner and the client predictor.

// Power maps to launch speed. At 0.45, power 100 lobs a 45 degree shot to the far edge of
// the map, so the whole charge bar is useful (roughly 40px of range per power point).
export const POWER_SPEED_MULTIPLIER = 0.45;

// Wind is rolled every turn in [-WIND_MAX, WIND_MAX] units and only pushes projectiles.
// One unit drifts a 45 degree cross-map shot by about 16px and a high lob by about 37px.
export const WIND_MAX = 5;
export const WIND_FORCE_PER_UNIT = 0.0025;

export interface TurnWind {
    type: 'wind_zone';
    id: string;
    position: { x: number; y: number };
    width: number;
    height: number;
    windDirection: number;
    windStrength: number;
    /** Signed wind in display units; positive blows right. */
    windSpeed: number;
}

/** Signed wind speed rounded to one decimal, DDTank style. */
export function rollWind(random: () => number = Math.random): number {
    return Math.round((random() * 2 - 1) * WIND_MAX * 10) / 10;
}

/** World-covering wind zone, tall enough that high lobs never leave it. */
export function turnWindHazard(speed: number, worldWidth = 2400, worldHeight = 600): TurnWind {
    return {
        type: 'wind_zone',
        id: 'turn_wind',
        position: { x: -200, y: -10000 },
        width: worldWidth + 400,
        height: worldHeight + 10200,
        windDirection: speed < 0 ? -1 : 1,
        windStrength: Math.abs(speed) * WIND_FORCE_PER_UNIT,
        windSpeed: speed,
    };
}
