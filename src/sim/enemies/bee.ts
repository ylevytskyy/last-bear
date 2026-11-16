import type { Vec3 } from '../level';
import type { Tuning } from '../tuning';

export type BeeState = 'HOVER' | 'WINDUP' | 'DASH' | 'STUCK' | 'RECOVER';
export type BeeInternal = {
  readonly id: string;
  readonly home: Vec3;
  readonly homeFacing: number;
  position: Vec3; // центр тіла
  facing: number;
  state: BeeState;
  stateTime: number;
  /** Ціль, зафіксована на початку замаху. */
  aim: Vec3 | null;
  /** Звідки почалось повернення додому. */
  recoverFrom: Vec3 | null;
  hp: number;
};
export type BeeEvent = 'windupStarted' | 'stuck' | 'recovered';
export type RayDistance = (from: Vec3, dir: Vec3, max: number) => number;

const EPS = 1e-9;
/** Гойдання у HOVER: амплітуда, м, і частота, рад/с. */
const BOB_AMPLITUDE = 0.08;
const BOB_RATE = 2.5;

export function createBee(id: string, home: Vec3, facing: number, hp = 1): BeeInternal {
  return { id, home: { ...home }, homeFacing: facing, position: { ...home }, facing, state: 'HOVER', stateTime: 0, aim: null, recoverFrom: null, hp };
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z);

function enter(bee: BeeInternal, state: BeeState): BeeInternal {
  return { ...bee, state, stateTime: 0 };
}

/** Бджола застрягає там, де є (влучила в Софійку або впала на перешкоду). */
export function stickBee(bee: BeeInternal): BeeInternal {
  return { ...enter(bee, 'STUCK'), aim: null };
}

/**
 * Один крок автомата Бджоли. `target` — центр капсули Софійки. `rayDistance` — відстань до
 * суцільного блока вздовж напрямку (одиничного), або `max`, якщо вільно.
 */
export function stepBee(
  bee: BeeInternal,
  target: Vec3,
  dt: number,
  rayDistance: RayDistance,
  tuning: Tuning,
): { bee: BeeInternal; events: BeeEvent[] } {
  const t = tuning.bee;
  const time = bee.stateTime + dt;
  switch (bee.state) {
    case 'HOVER': {
      if (length(sub(target, bee.position)) < t.aggroRadius) {
        const toward = sub(target, bee.position);
        return {
          bee: { ...enter(bee, 'WINDUP'), aim: { ...target }, facing: Math.atan2(toward.x, toward.z) },
          events: ['windupStarted'],
        };
      }
      const y = bee.home.y + BOB_AMPLITUDE * Math.sin(time * BOB_RATE);
      return { bee: { ...bee, stateTime: time, position: { ...bee.home, y } }, events: [] };
    }
    case 'WINDUP':
      if (time >= t.windupSeconds - EPS) return { bee: enter(bee, 'DASH'), events: [] };
      return { bee: { ...bee, stateTime: time }, events: [] };
    case 'DASH': {
      const aim = bee.aim ?? bee.position;
      const d = sub(aim, bee.position);
      const len = length(d);
      // Ціль уже під Бджолою — летить далі вниз, доки не впреться.
      const dir = len > 1e-6 ? { x: d.x / len, y: d.y / len, z: d.z / len } : { x: 0, y: -1, z: 0 };
      // Напрямок фіксується на першому кроці Ривка: далі `aim` — точка далеко на тій самій прямій.
      const farAim = { x: bee.position.x + dir.x * 100, y: bee.position.y + dir.y * 100, z: bee.position.z + dir.z * 100 };
      const travel = t.dashSpeed * dt;
      const free = rayDistance(bee.position, dir, travel + t.radius);
      if (free < travel + t.radius) {
        const go = Math.max(0, free - t.radius);
        const position = { x: bee.position.x + dir.x * go, y: bee.position.y + dir.y * go, z: bee.position.z + dir.z * go };
        // Ривок навскіс: зупинка за радіус уздовж променя ще лишає кулю в підлозі — піднімаємо над нею.
        const below = rayDistance(position, { x: 0, y: -1, z: 0 }, t.radius);
        if (below < t.radius) position.y += t.radius - below;
        return { bee: stickBee({ ...bee, position }), events: ['stuck'] };
      }
      const position = { x: bee.position.x + dir.x * travel, y: bee.position.y + dir.y * travel, z: bee.position.z + dir.z * travel };
      if (time >= t.dashMaxSeconds - EPS) return { bee: stickBee({ ...bee, position }), events: ['stuck'] };
      return { bee: { ...bee, stateTime: time, position, aim: farAim }, events: [] };
    }
    case 'STUCK':
      if (time >= t.stuckSeconds - EPS) {
        return { bee: { ...enter(bee, 'RECOVER'), recoverFrom: { ...bee.position } }, events: [] };
      }
      return { bee: { ...bee, stateTime: time }, events: [] };
    case 'RECOVER': {
      const from = bee.recoverFrom ?? bee.position;
      const k = Math.min(1, time / t.recoverSeconds);
      const position = {
        x: from.x + (bee.home.x - from.x) * k,
        y: from.y + (bee.home.y - from.y) * k,
        z: from.z + (bee.home.z - from.z) * k,
      };
      if (time >= t.recoverSeconds - EPS) {
        return { bee: { ...enter(bee, 'HOVER'), position: { ...bee.home }, facing: bee.homeFacing, recoverFrom: null }, events: ['recovered'] };
      }
      return { bee: { ...bee, stateTime: time, position }, events: [] };
    }
  }
}
