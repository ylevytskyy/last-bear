import { describe, expect, it } from 'vitest';
import { NO_INPUT, type Input } from './input';
import type { Block, EnemySpawn, Level } from './level';
import { createSim, type Sim, type SimEvent } from './sim';
import { TUNING } from './tuning';

const FLOOR: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 30, y: 0.5, z: 30 } };
const bee = (z: number): EnemySpawn => ({ id: 'b1', kind: 'bee', position: { x: 0, y: 1.5, z }, facing: Math.PI });
const turtle = (z: number): EnemySpawn => ({ id: 't1', kind: 'turtle', position: { x: 0, y: 0, z }, facing: Math.PI });
const level = (enemies: EnemySpawn[], blocks: Block[] = [FLOOR]): Level => ({ blocks, spawn: { x: 0, y: 0, z: 0 }, killY: -20, enemies });
const SHIFT: Input = { ...NO_INPUT, blink: true };
const types = (events: SimEvent[]) => events.map((e) => e.type);
function steps(sim: Sim, n: number, input: Input = NO_INPUT): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...sim.step(input));
  return out;
}
const angleTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe('Reflex', () => {
  it('Shift in the Window puts her behind the bee, facing it; the dash misses', async () => {
    const sim = await createSim(level([bee(3)]));
    sim.step(NO_INPUT);
    expect(sim.slowdown.open).toBe(true);
    const events = sim.step(SHIFT);
    const reflexed = events.find((e) => e.type === 'reflexed');
    expect(reflexed).toBeDefined();
    if (reflexed?.type === 'reflexed') {
      expect(reflexed.enemyId).toBe('b1');
      expect(reflexed.from.z).toBeCloseTo(0, 2);
    }
    expect(events).toContainEqual({ type: 'windowClosed', reflexed: true });
    expect(types(events)).not.toContain('blinked');
    const p = sim.sofiyka.position;
    const b = sim.enemies[0]!.position;
    expect(p.z - b.z).toBeCloseTo(TUNING.reflexBehindDistance, 1);
    expect(Math.abs(p.x)).toBeLessThan(0.05);
    expect(angleGap(sim.sofiyka.facing, angleTo(p, b))).toBeLessThan(1e-6);
    expect(sim.slowdown.open).toBe(false);
    expect(sim.timeScale).toBe(1);
    expect(sim.sofiyka.blinkCooldown).toBe(0); // Рефлекс не витрачає Blink
    expect(sim.sofiyka.invulnerable).toBeCloseTo(TUNING.reflexInvulnerableSeconds, 6);

    const later = steps(sim, 240);
    expect(types(later)).not.toContain('heartLost');
    expect(sim.sofiyka.hearts).toBe(5);
    expect(sim.enemies[0]!.state).not.toBe('HOVER'); // Ривок відбувся, Бджола застрягла або вертається
    sim.dispose();
  });

  it('Shift on the last step of a Turtle’s Window puts her by the flask, safe through the spin', async () => {
    const sim = await createSim(level([turtle(2)]));
    sim.step(NO_INPUT);
    expect(sim.slowdown.open).toBe(true);
    while (sim.slowdown.remaining > 1 / 12 + 1e-6) sim.step(NO_INPUT);
    expect(sim.slowdown.open).toBe(true);
    const events = sim.step(SHIFT);
    expect(types(events)).toContain('reflexed');
    const t = sim.enemies[0]!;
    expect(sim.sofiyka.position.z - t.position.z).toBeCloseTo(TUNING.reflexBehindDistance, 1);
    // Вона з боку Колби: напрямок «від голови» Черепахи.
    const flaskSide = t.facing + Math.PI;
    expect(angleGap(flaskSide, angleTo(t.position, sim.sofiyka.position))).toBeLessThan(0.1);
    const later = steps(sim, Math.round((TUNING.turtle.windupSeconds + TUNING.turtle.spinSeconds) / TUNING.step));
    expect(types(later)).not.toContain('heartLost');
    expect(sim.sofiyka.hearts).toBe(5);
    sim.dispose();
  });

  it('with an abyss behind the enemy nothing happens: no Reflex, no Blink, the Window stays open', async () => {
    const short: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: -6 }, halfExtents: { x: 10, y: 0.5, z: 9.5 } }; // край на z = 3.5
    const sim = await createSim(level([bee(3)], [short]));
    sim.step(NO_INPUT);
    const remaining = sim.slowdown.remaining;
    const events = sim.step(SHIFT);
    expect(types(events)).not.toContain('reflexed');
    expect(types(events)).not.toContain('blinked');
    expect(sim.sofiyka.position.z).toBeCloseTo(0, 2);
    expect(sim.slowdown.open).toBe(true);
    expect(sim.slowdown.remaining).toBeLessThan(remaining);
    sim.dispose();
  });

  it('with a wall right behind the enemy nothing happens either', async () => {
    const wall: Block = { kind: 'solid', center: { x: 0, y: 2, z: 3.8 }, halfExtents: { x: 10, y: 2, z: 0.3 } }; // лице на z = 3.5
    const sim = await createSim(level([bee(3)], [FLOOR, wall]));
    sim.step(NO_INPUT);
    const events = sim.step(SHIFT);
    expect(types(events)).not.toContain('reflexed');
    expect(types(events)).not.toContain('blinked');
    expect(sim.slowdown.open).toBe(true);
    sim.dispose();
  });

  it('Shift outside the Window is still a Blink', async () => {
    const sim = await createSim(level([bee(20)]));
    const events = sim.step(SHIFT);
    expect(types(events)).toContain('blinked');
    expect(types(events)).not.toContain('reflexed');
    sim.dispose();
  });
});
