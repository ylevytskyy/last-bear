import { describe, expect, it } from 'vitest';
import { NO_INPUT, type Input } from './input';
import type { Block, EnemySpawn, Level, Vec3 } from './level';
import { createSim, type Sim, type SimEvent } from './sim';
import { TUNING } from './tuning';

const FLOOR: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 30, y: 0.5, z: 30 } };
/** Черепаха дивиться на старт Софійки (−z). */
const turtle = (id: string, z: number): EnemySpawn => ({ id, kind: 'turtle', position: { x: 0, y: 0, z }, facing: Math.PI });
const level = (enemies: EnemySpawn[], blocks: Block[] = [FLOOR], spawn: Vec3 = { x: 0, y: 0, z: 0 }): Level => ({
  blocks,
  spawn,
  killY: -20,
  enemies,
});
const types = (events: SimEvent[]) => events.map((e) => e.type);
function steps(sim: Sim, n: number, input: Input = NO_INPUT): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...sim.step(input));
  return out;
}
const theTurtle = (sim: Sim) => sim.enemies.find((e) => e.kind === 'turtle')!;
const S = (seconds: number) => Math.round(seconds / TUNING.step);

describe('Turtle in the rules', () => {
  it('walks toward her at about 1.2 m/s, facing her', async () => {
    const sim = await createSim(level([turtle('t1', 7)]));
    steps(sim, 60);
    const t = theTurtle(sim);
    expect(t.state).toBe('WALK');
    expect(t.attacking).toBe(false);
    expect(t.vulnerable).toBe(false);
    expect(7 - t.position.z).toBeCloseTo(1.2, 1);
    expect(Math.abs(Math.abs(t.facing) - Math.PI)).toBeLessThan(1e-3);
    sim.dispose();
  });

  it('winds up near her, then spins; attacking throughout, facing frozen', async () => {
    const sim = await createSim(level([turtle('t1', 2)]));
    const first = sim.step(NO_INPUT);
    expect(first).toContainEqual({ type: 'enemyWindup', id: 't1' });
    const facing = theTurtle(sim).facing;
    const seen = new Set<string>();
    for (let i = 0; i < S(TUNING.turtle.windupSeconds + 0.5); i++) {
      sim.step({ ...NO_INPUT, moveX: 1 }); // забігає вбік
      seen.add(theTurtle(sim).state);
      if (theTurtle(sim).state !== 'WALK') expect(theTurtle(sim).attacking).toBe(true);
      expect(theTurtle(sim).facing).toBe(facing);
    }
    expect(seen.has('WINDUP')).toBe(true);
    expect(seen.has('SPIN')).toBe(true);
    sim.dispose();
  });

  it('a spin hits her once in all its length, even when a wall behind keeps her in reach', async () => {
    const wall: Block = { kind: 'solid', center: { x: 0, y: 2, z: -0.7 }, halfExtents: { x: 5, y: 2, z: 0.25 } };
    const sim = await createSim(level([turtle('t1', 1.5)], [FLOOR, wall]));
    const events = steps(sim, S(TUNING.turtle.windupSeconds + TUNING.turtle.spinSeconds + 0.1));
    expect(types(events).filter((t) => t === 'heartLost')).toHaveLength(1);
    expect(events).toContainEqual({ type: 'heartLost', cause: 'hit' });
    expect(sim.sofiyka.hearts).toBe(4);
    expect(theTurtle(sim).state).toBe('COOLDOWN');
    sim.dispose();
  });

  it('walking out of reach during the windup dodges the spin; cooldown 2 s, then walk', async () => {
    const sim = await createSim(level([turtle('t1', 2)]));
    sim.step(NO_INPUT);
    const events = steps(sim, 30, { ...NO_INPUT, moveZ: -1 });
    for (let i = 0; i < 1000 && theTurtle(sim).state !== 'COOLDOWN'; i++) events.push(...sim.step(NO_INPUT));
    expect(theTurtle(sim).state).toBe('COOLDOWN');
    expect(types(events)).not.toContain('heartLost');
    steps(sim, S(TUNING.turtle.cooldownSeconds) - 2);
    expect(theTurtle(sim).state).toBe('COOLDOWN');
    steps(sim, 3);
    expect(theTurtle(sim).state).toBe('WALK');
    expect(sim.sofiyka.hearts).toBe(5);
    sim.dispose();
  });

  it('stops at the edge of its platform instead of walking off toward her', async () => {
    const island: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 3, y: 0.5, z: 3 } };
    const hers: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: -7 }, halfExtents: { x: 3, y: 0.5, z: 2 } };
    const sim = await createSim(level([turtle('t1', 1)], [island, hers], { x: 0, y: 0, z: -6 }));
    steps(sim, 300);
    const t = theTurtle(sim);
    expect(t.position.z).toBeGreaterThan(-3);
    expect(t.position.z).toBeLessThan(-3 + TUNING.turtle.radius + 0.1);
    expect(t.position.y).toBe(0);
    sim.dispose();
  });

  it('a respawn puts the turtle back home', async () => {
    const sim = await createSim(level([turtle('t1', 1.5)]), { ...TUNING, hearts: 1 });
    for (let i = 0; i < 300 && !types(sim.step(NO_INPUT)).includes('respawned'); i++);
    const t = theTurtle(sim);
    expect(t.state).toBe('WALK');
    expect(t.position).toEqual({ x: 0, y: 0, z: 1.5 });
    expect(t.facing).toBe(Math.PI);
    sim.dispose();
  });
});
