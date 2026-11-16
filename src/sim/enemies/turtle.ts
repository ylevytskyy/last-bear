import type { Vec3 } from '../level';
import type { Tuning } from '../tuning';

export type TurtleState = 'WALK' | 'WINDUP' | 'SPIN' | 'COOLDOWN';
export type TurtleInternal = {
  readonly id: string;
  readonly home: Vec3;
  readonly homeFacing: number;
  position: Vec3; // підошви
  facing: number; // куди дивиться голова; Колба на протилежному боці
  state: TurtleState;
  stateTime: number;
  /** Цей оберт уже вдарив Софійку. */
  spinLanded: boolean;
  hp: number;
};
export type TurtleEvent = 'windupStarted' | 'spinStarted' | 'spinEnded';
export type TurtleGround = {
  /** Відстань униз до суцільної землі, або `max`. */
  rayDown: (from: Vec3, max: number) => number;
  /** Відстань до суцільного блока вздовж одиничного напрямку, або `max`. */
  rayDistance: (from: Vec3, dir: Vec3, max: number) => number;
};

const EPS = 1e-9;
/** Звідки пускаємо промені: на стільки вище підошов, м. */
const PROBE_LIFT = 0.5;
/** Земля має бути не глибше за стільки під підошвами, м. */
const GROUND_DEPTH = 0.3;

export function createTurtle(id: string, home: Vec3, facing: number, hp = 1): TurtleInternal {
  return { id, home: { ...home }, homeFacing: facing, position: { ...home }, facing, state: 'WALK', stateTime: 0, spinLanded: false, hp };
}

const enter = (t: TurtleInternal, state: TurtleState): TurtleInternal => ({ ...t, state, stateTime: 0 });

/**
 * Один крок автомата Черепахи. `target` — підошви Софійки; відстані по площині xz.
 * Під час WINDUP, SPIN і COOLDOWN `facing` заморожений.
 */
export function stepTurtle(
  turtle: TurtleInternal,
  target: Vec3,
  dt: number,
  ground: TurtleGround,
  tuning: Tuning,
): { turtle: TurtleInternal; events: TurtleEvent[] } {
  const t = tuning.turtle;
  const time = turtle.stateTime + dt;
  switch (turtle.state) {
    case 'WALK': {
      const dx = target.x - turtle.position.x;
      const dz = target.z - turtle.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= t.aggroRadius) return { turtle: { ...turtle, stateTime: time }, events: [] };
      const facing = dist > 1e-6 ? Math.atan2(dx, dz) : turtle.facing;
      if (dist < t.attackRange && Math.abs(target.y - turtle.position.y) <= t.reachHeight) {
        return { turtle: { ...enter(turtle, 'WINDUP'), facing, spinLanded: false }, events: ['windupStarted'] };
      }
      const dir = { x: dx / dist, y: 0, z: dz / dist };
      const travel = t.walkSpeed * dt;
      const probe = { x: turtle.position.x, y: turtle.position.y + PROBE_LIFT, z: turtle.position.z };
      const wallFree = ground.rayDistance(probe, dir, travel + t.radius) >= travel + t.radius - EPS;
      const ahead = {
        x: turtle.position.x + dir.x * (travel + t.radius),
        y: probe.y,
        z: turtle.position.z + dir.z * (travel + t.radius),
      };
      const reach = PROBE_LIFT + GROUND_DEPTH;
      const groundAhead = ground.rayDown(ahead, reach) < reach;
      if (!wallFree || !groundAhead) return { turtle: { ...turtle, facing, stateTime: time }, events: [] };
      const position = { x: turtle.position.x + dir.x * travel, y: turtle.position.y, z: turtle.position.z + dir.z * travel };
      return { turtle: { ...turtle, facing, position, stateTime: time }, events: [] };
    }
    case 'WINDUP':
      if (time >= t.windupSeconds - EPS) return { turtle: { ...enter(turtle, 'SPIN'), spinLanded: false }, events: ['spinStarted'] };
      return { turtle: { ...turtle, stateTime: time }, events: [] };
    case 'SPIN':
      if (time >= t.spinSeconds - EPS) return { turtle: enter(turtle, 'COOLDOWN'), events: ['spinEnded'] };
      return { turtle: { ...turtle, stateTime: time }, events: [] };
    case 'COOLDOWN':
      if (time >= t.cooldownSeconds - EPS) return { turtle: enter(turtle, 'WALK'), events: [] };
      return { turtle: { ...turtle, stateTime: time }, events: [] };
  }
}
