import { describe, expect, it } from 'vitest';
import { NO_INPUT, type Input } from './input';
import type { Block, EnemySpawn, Level } from './level';
import { createSim, type Sim, type SimEvent } from './sim';
import { TUNING } from './tuning';

const FLOOR: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 30, y: 0.5, z: 30 } };
const bee = (id: string, x: number, z: number): EnemySpawn => ({ id, kind: 'bee', position: { x, y: 1.5, z }, facing: Math.PI });
const level = (enemies: EnemySpawn[], ...blocks: Block[]): Level => ({
  blocks: [FLOOR, ...blocks],
  spawn: { x: 0, y: 0, z: 0 },
  killY: -20,
  enemies,
});
const types = (events: SimEvent[]) => events.map((e) => e.type);

function steps(sim: Sim, n: number, input: Input = NO_INPUT): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...sim.step(input));
  return out;
}
/** Крокує, поки не з'явиться подія; повертає всі події до неї включно. */
function until(sim: Sim, type: SimEvent['type'], max = 600, input: Input = NO_INPUT): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < max; i++) {
    const e = sim.step(input);
    out.push(...e);
    if (e.some((x) => x.type === type)) return out;
  }
  throw new Error(`no ${type} in ${max} steps`);
}
const theBee = (sim: Sim) => sim.enemies.find((e) => e.kind === 'bee')!;

describe('Bee in the rules', () => {
  it('hovers while Sofiyka is far, and winds up the step she is near', async () => {
    const far = await createSim(level([bee('b1', 0, 12)]));
    expect(types(steps(far, 120))).not.toContain('enemyWindup');
    expect(theBee(far).state).toBe('HOVER');
    expect(theBee(far).attacking).toBe(false);
    expect(far.timeScale).toBe(1);
    expect(far.slowdown.open).toBe(false);
    far.dispose();

    const near = await createSim(level([bee('b1', 0, 6)]));
    const events = near.step(NO_INPUT);
    expect(events).toContainEqual({ type: 'enemyWindup', id: 'b1' });
    expect(theBee(near).state).toBe('WINDUP');
    expect(theBee(near).attacking).toBe(true);
    expect(theBee(near).vulnerable).toBe(false);
    near.dispose();
  });

  it('a dash that reaches her costs one heart, throws her straight back and leaves the bee stuck', async () => {
    const sim = await createSim(level([bee('b1', 0, 6)]));
    const events = until(sim, 'heartLost');
    expect(events.filter((e) => e.type === 'heartLost')).toEqual([{ type: 'heartLost', cause: 'hit' }]);
    expect(sim.sofiyka.hearts).toBe(4);
    expect(sim.sofiyka.mode).toBe('HURT');
    expect(sim.sofiyka.invulnerable).toBeCloseTo(TUNING.invulnerableSeconds, 1);
    expect(theBee(sim).state).toBe('STUCK');

    steps(sim, Math.round(TUNING.knockbackSeconds / TUNING.step) + 5);
    expect(sim.sofiyka.position.z).toBeLessThan(-TUNING.knockbackDistance + 0.3);
    expect(Math.abs(sim.sofiyka.position.x)).toBeLessThan(0.05);
    expect(sim.sofiyka.mode).toBe('IDLE');
    sim.dispose();
  });

  it('a bee coming in on a diagonal throws her back along that diagonal', async () => {
    const sim = await createSim(level([bee('b1', 4, 4)]));
    until(sim, 'heartLost');
    const at = { ...sim.sofiyka.position };
    steps(sim, Math.round(TUNING.knockbackSeconds / TUNING.step) + 5);
    const moved = { x: sim.sofiyka.position.x - at.x, z: sim.sofiyka.position.z - at.z };
    expect(Math.hypot(moved.x, moved.z)).toBeGreaterThan(TUNING.knockbackDistance * 0.8);
    expect(moved.x).toBeLessThan(0);
    expect(moved.x / moved.z).toBeCloseTo(1, 1);
    sim.dispose();
  });

  it('stepping aside after the windup started dodges the dash: no heart lost, stuck for 2 s, recover 1.5 s, then hover', async () => {
    const sim = await createSim(level([bee('b1', 0, 6)]));
    sim.step(NO_INPUT);
    const all = steps(sim, 24, { ...NO_INPUT, moveX: 1 });
    for (let i = 0; i < 200 && theBee(sim).state !== 'STUCK'; i++) all.push(...sim.step(NO_INPUT));
    expect(theBee(sim).state).toBe('STUCK');
    expect(theBee(sim).vulnerable).toBe(true);
    all.push(...steps(sim, Math.round(TUNING.bee.stuckSeconds / TUNING.step) - 2));
    expect(theBee(sim).state).toBe('STUCK');
    all.push(...steps(sim, 3));
    expect(theBee(sim).state).toBe('RECOVER');
    expect(theBee(sim).vulnerable).toBe(false);
    let recoverSteps = 1;
    while (theBee(sim).state === 'RECOVER' && recoverSteps < 400) {
      all.push(...sim.step(NO_INPUT));
      recoverSteps++;
    }
    expect(theBee(sim).state).toBe('HOVER');
    expect(recoverSteps * TUNING.step).toBeCloseTo(TUNING.bee.recoverSeconds, 1);
    expect(theBee(sim).position.z).toBeCloseTo(6, 1);
    expect(types(all)).not.toContain('heartLost');
    expect(sim.sofiyka.hearts).toBe(5);
    sim.dispose();
  });

  it('a dash into a solid wall stops one radius in front of it', async () => {
    const wall: Block = { kind: 'solid', center: { x: 0, y: 2, z: 3.25 }, halfExtents: { x: 5, y: 2, z: 0.25 } };
    const sim = await createSim(level([bee('b1', 0, 6)], wall));
    for (let i = 0; i < 200 && theBee(sim).state !== 'STUCK'; i++) sim.step(NO_INPUT);
    expect(theBee(sim).state).toBe('STUCK');
    const z = theBee(sim).position.z;
    expect(z).toBeGreaterThanOrEqual(3.5 + TUNING.bee.radius - 0.05);
    expect(z).toBeLessThan(3.5 + TUNING.bee.radius + 0.2);
    expect(sim.sofiyka.hearts).toBe(5);
    sim.dispose();
  });

  it('a wall behind her stops the knockback, and the heart is taken once', async () => {
    const wall: Block = { kind: 'solid', center: { x: 0, y: 2, z: -1.25 }, halfExtents: { x: 5, y: 2, z: 0.25 } };
    const sim = await createSim(level([bee('b1', 0, 6)], wall));
    const events = until(sim, 'heartLost');
    events.push(...steps(sim, 40));
    expect(types(events).filter((t) => t === 'heartLost')).toHaveLength(1);
    expect(sim.sofiyka.hearts).toBe(4);
    expect(sim.sofiyka.position.z).toBeGreaterThan(-1 + TUNING.capsuleRadius - 0.05);
    expect(sim.sofiyka.position.z).toBeLessThan(-1 + TUNING.capsuleRadius + 0.1);
    sim.dispose();
  });

  it('while invulnerable a second bee that reaches her costs nothing', async () => {
    const sim = await createSim(level([bee('b1', 0, 6), bee('b2', 0, -6)]));
    const events = steps(sim, 120);
    expect(types(events).filter((t) => t === 'heartLost')).toHaveLength(1);
    expect(sim.sofiyka.hearts).toBe(4);
    sim.dispose();
  });

  it('a respawn puts a stuck bee back home, hovering', async () => {
    const sim = await createSim(level([bee('b1', 0, 6)]), { ...TUNING, hearts: 1 });
    const events = until(sim, 'respawned');
    expect(types(events)).toContain('heartLost');
    expect(sim.sofiyka.hearts).toBe(1);
    expect(theBee(sim).state).toBe('HOVER');
    expect(theBee(sim).position).toEqual({ x: 0, y: 1.5, z: 6 });
    expect(theBee(sim).hp).toBe(TUNING.hitsToDefeat.bee);
    expect(sim.sofiyka.mode).not.toBe('HURT');
    sim.dispose();
  });
});
