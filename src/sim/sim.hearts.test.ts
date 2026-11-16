import { describe, expect, it } from 'vitest';
import { NO_INPUT } from './input';
import type { Block, Level } from './level';
import { createSim, type Sim, type SimEvent } from './sim';

const PLATFORM: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 3, y: 0.5, z: 3 } };
const level = (): Level => ({ blocks: [PLATFORM], spawn: { x: 0, y: 0, z: 0 }, killY: -5 });
const FORWARD = { ...NO_INPUT, moveZ: 1 };

/** Ходить уперед, поки не станеться падіння; повертає події до кінця повернення. */
function walkOffEdge(sim: Sim): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < 400; i++) {
    const e = sim.step(FORWARD);
    events.push(...e);
    if (e.some((x) => x.type === 'returned' || x.type === 'respawned')) return events;
  }
  throw new Error('never fell');
}
function idle(sim: Sim, steps: number): void {
  for (let i = 0; i < steps; i++) sim.step(NO_INPUT);
}
const types = (events: SimEvent[]) => events.map((e) => e.type);

describe('hearts and falling', () => {
  it('starts with five hearts and no invulnerability', async () => {
    const sim = await createSim(level());
    expect(sim.sofiyka.hearts).toBe(5);
    expect(sim.sofiyka.invulnerable).toBe(0);
    sim.dispose();
  });

  it('a fall costs a heart and puts her back on solid ground, away from the edge', async () => {
    const sim = await createSim(level());
    const events = walkOffEdge(sim);
    expect(types(events).filter((t) => t === 'heartLost')).toHaveLength(1);
    expect(events).toContainEqual({ type: 'heartLost', cause: 'fall' });
    expect(types(events).indexOf('heartLost')).toBeLessThan(types(events).indexOf('returned'));
    expect(sim.sofiyka.hearts).toBe(4);

    idle(sim, 5);
    const p = sim.sofiyka.position;
    expect(Math.abs(p.y)).toBeLessThan(0.05);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(3 - 0.5 + 0.01);
    expect(Math.abs(p.z)).toBeLessThanOrEqual(3 - 0.5 + 0.01);
    expect(sim.sofiyka.velocityY).toBeCloseTo(0, 5);
    sim.dispose();
  });

  it('reports no landing for the return', async () => {
    const sim = await createSim(level());
    const events = [...walkOffEdge(sim)];
    for (let i = 0; i < 30; i++) events.push(...sim.step(NO_INPUT));
    expect(types(events)).not.toContain('landed');
    sim.dispose();
  });

  it('a second fall while invulnerable returns her but costs nothing; afterwards it costs again', async () => {
    const sim = await createSim(level());
    walkOffEdge(sim);
    expect(sim.sofiyka.hearts).toBe(4);
    expect(sim.sofiyka.invulnerable).toBeGreaterThan(0);

    const second = walkOffEdge(sim);
    expect(types(second)).toContain('returned');
    expect(types(second)).not.toContain('heartLost');
    expect(sim.sofiyka.hearts).toBe(4);

    idle(sim, 70); // більше за 1 с
    expect(sim.sofiyka.invulnerable).toBe(0);
    walkOffEdge(sim);
    expect(sim.sofiyka.hearts).toBe(3);
    sim.dispose();
  });

  it('losing the last heart respawns her at the start with five hearts', async () => {
    const sim = await createSim(level());
    for (let lost = 0; lost < 4; lost++) {
      walkOffEdge(sim);
      idle(sim, 70);
    }
    expect(sim.sofiyka.hearts).toBe(1);
    const events = walkOffEdge(sim);
    expect(types(events)).toContain('respawned');
    expect(types(events)).not.toContain('returned');
    expect(sim.sofiyka.hearts).toBe(5);
    expect(sim.sofiyka.invulnerable).toBe(0);
    expect(sim.sofiyka.jumpsUsed).toBe(0);
    expect(sim.sofiyka.position).toEqual({ x: 0, y: 0, z: 0 });
    sim.dispose();
  });
});
