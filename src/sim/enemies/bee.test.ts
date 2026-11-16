import { describe, expect, it } from 'vitest';
import { TUNING } from '../tuning';
import type { Vec3 } from '../level';
import { createBee, stepBee, type BeeInternal } from './bee';

const DT = TUNING.step;
const open = (_from: Vec3, _dir: Vec3, max: number) => max;
const HOME = { x: 0, y: 1.5, z: 0 };

function run(bee: BeeInternal, target: Vec3, seconds: number, ray = open) {
  const events: string[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const r = stepBee(bee, target, DT, ray, TUNING);
    bee = r.bee;
    events.push(...r.events);
  }
  return { bee, events };
}

describe('Bee state machine', () => {
  it('hovers near home while Sofiyka is beyond the aggro radius', () => {
    const { bee, events } = run(createBee('b', HOME, 0), { x: 0, y: 0.7, z: 12 }, 2);
    expect(bee.state).toBe('HOVER');
    expect(events).toEqual([]);
    expect(Math.hypot(bee.position.x - HOME.x, bee.position.y - HOME.y, bee.position.z - HOME.z)).toBeLessThan(0.2);
  });

  it('starts a windup the step she comes within the aggro radius and fixes the aim there', () => {
    const r = stepBee(createBee('b', HOME, 0), { x: 0, y: 0.7, z: 6 }, DT, open, TUNING);
    expect(r.bee.state).toBe('WINDUP');
    expect(r.events).toEqual(['windupStarted']);
    expect(r.bee.aim).toEqual({ x: 0, y: 0.7, z: 6 });
    // Ціль, що втекла, не змінює прицілу.
    const later = stepBee(r.bee, { x: 5, y: 0.7, z: 6 }, DT, open, TUNING);
    expect(later.bee.aim).toEqual({ x: 0, y: 0.7, z: 6 });
  });

  it('holds still for the whole windup, then dashes toward the aim at dash speed', () => {
    const target = { x: 0, y: 1.5, z: 6 };
    let { bee } = run(createBee('b', HOME, 0), target, DT);
    ({ bee } = run(bee, target, TUNING.bee.windupSeconds - 2 * DT));
    expect(bee.state).toBe('WINDUP');
    expect(bee.position.z).toBeCloseTo(0, 6);
    ({ bee } = run(bee, target, 2 * DT));
    expect(bee.state).toBe('DASH');
    const z0 = bee.position.z;
    ({ bee } = run(bee, target, 0.25));
    expect(bee.position.z - z0).toBeCloseTo(TUNING.bee.dashSpeed * 0.25, 1);
  });

  it('after a dash that hits nothing it is stuck, then recovers home, then hovers', () => {
    const target = { x: 0, y: 1.5, z: 6 };
    let { bee } = run(createBee('b', HOME, 0), target, DT + TUNING.bee.windupSeconds);
    ({ bee } = run(bee, target, TUNING.bee.dashMaxSeconds + DT));
    expect(bee.state).toBe('STUCK');
    ({ bee } = run(bee, target, TUNING.bee.stuckSeconds - 2 * DT));
    expect(bee.state).toBe('STUCK');
    ({ bee } = run(bee, target, 3 * DT));
    expect(bee.state).toBe('RECOVER');
    ({ bee } = run(bee, { x: 0, y: 0.7, z: 50 }, TUNING.bee.recoverSeconds + 2 * DT));
    expect(bee.state).toBe('HOVER');
    expect(bee.position.z).toBeCloseTo(HOME.z, 1);
  });

  it('a dash into a solid wall stops one radius short of it', () => {
    // Стіна за 4 м попереду: промінь бачить її.
    const wall = (from: Vec3, dir: Vec3, max: number) => (dir.z > 0 ? Math.min(max, Math.max(0, 4 - from.z)) : max);
    const target = { x: 0, y: 1.5, z: 6 };
    let { bee } = run(createBee('b', HOME, 0), target, DT + TUNING.bee.windupSeconds, wall);
    ({ bee } = run(bee, target, TUNING.bee.dashMaxSeconds, wall));
    expect(bee.state).toBe('STUCK');
    expect(bee.position.z).toBeCloseTo(4 - TUNING.bee.radius, 2);
  });
});
