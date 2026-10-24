import type Matter from 'matter-js';
import {
    DAMAGE_MULTIPLIERS, DAMAGE_SCALE, IMPACT_THRESHOLD,
    PROJECTILE_BLOCK_DAMAGE_MULT, PROJECTILE_MIN_IMPACT, PROJECTILE_MAX_BLOCK_DAMAGE,
    PROJECTILE_KING_DAMAGE_SCALE, PROJECTILE_MAX_KING_DAMAGE,
} from '../config/constants';

const BASE_DELTA = 1000 / 60;

// collisionStart is before resolution, but Body.velocity is still half-step displacement.
export function incomingVelocity(body: Matter.Body): Matter.Vector {
    const integrated = body as Matter.Body & { deltaTime?: number; positionPrev: Matter.Vector };
    const scale = BASE_DELTA / (integrated.deltaTime || BASE_DELTA);
    return {
        x: (body.position.x - integrated.positionPrev.x) * scale,
        y: (body.position.y - integrated.positionPrev.y) * scale,
    };
}

export function closingSpeed(a: Matter.Body, b: Matter.Body, normal: Matter.Vector): number {
    const va = incomingVelocity(a);
    const vb = incomingVelocity(b);
    // Matter's collision normal points from bodyB towards bodyA.
    const normalVelocity = (va.x - vb.x) * normal.x + (va.y - vb.y) * normal.y;
    if (normalVelocity <= 0) return -normalVelocity;
    // A fast ball can cross the king's centre in one half-step, flipping the
    // detected normal even though the bodies were approaching before integration.
    const previousA = (a as Matter.Body & { positionPrev: Matter.Vector }).positionPrev;
    const previousB = (b as Matter.Body & { positionPrev: Matter.Vector }).positionPrev;
    const approaching = (previousA.x - previousB.x) * (va.x - vb.x) +
        (previousA.y - previousB.y) * (va.y - vb.y) < 0;
    return approaching ? normalVelocity : 0;
}

function reducedMass(a: Matter.Body, b: Matter.Body): number {
    if (a.isStatic) return b.mass;
    if (b.isStatic) return a.mass;
    return a.mass * b.mass / (a.mass + b.mass);
}

export function kingImpactDamage(king: Matter.Body, other: Matter.Body, speed: number): number {
    const impulse = speed * reducedMass(king, other);
    if (!Number.isFinite(impulse) || impulse <= IMPACT_THRESHOLD) return 0;
    if (other.label === 'projectile') {
        return Math.min(PROJECTILE_MAX_KING_DAMAGE,
            Math.max(0, speed - PROJECTILE_MIN_IMPACT) * PROJECTILE_KING_DAMAGE_SCALE);
    }
    return (impulse - IMPACT_THRESHOLD) * (DAMAGE_MULTIPLIERS[other.label] ?? 1) * DAMAGE_SCALE;
}

export function projectileBlockDamage(projectile: Matter.Body, block: Matter.Body, speed: number): number {
    const impulse = speed * reducedMass(projectile, block);
    if (!Number.isFinite(impulse) || speed < PROJECTILE_MIN_IMPACT || impulse < PROJECTILE_MIN_IMPACT) return 0;
    return Math.min(PROJECTILE_MAX_BLOCK_DAMAGE, impulse * PROJECTILE_BLOCK_DAMAGE_MULT);
}
