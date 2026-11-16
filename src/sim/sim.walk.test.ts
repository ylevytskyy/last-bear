import { describe, expect, it } from 'vitest';
import { NO_INPUT, type Input } from './input';
import type { Block, Level } from './level';
import { createSim, type Sim } from './sim';

const FLOOR: Block = {
  kind: 'solid',
  center: { x: 0, y: -0.5, z: 0 },
  halfExtents: { x: 30, y: 0.5, z: 30 },
};

function levelWith(...blocks: Block[]): Level {
  return { blocks: [FLOOR, ...blocks], spawn: { x: 0, y: 0, z: 0 }, killY: -20 };
}

function run(sim: Sim, steps: number, input: Input) {
  for (let i = 0; i < steps; i++) sim.step(input);
}

const FORWARD: Input = { ...NO_INPUT, moveZ: 1 };

describe('Sofiyka walking', () => {
  it('moves 5 m along +z in one second and shows RUN, then IDLE without input', async () => {
    const sim = await createSim(levelWith());
    run(sim, 60, FORWARD);

    expect(sim.sofiyka.position.z).toBeCloseTo(5, 0);
    expect(Math.abs(sim.sofiyka.position.z - 5)).toBeLessThan(0.1);
    expect(sim.sofiyka.position.x).toBeCloseTo(0, 2);
    expect(sim.sofiyka.position.y).toBeCloseTo(0, 1);
    expect(sim.sofiyka.facing).toBeCloseTo(0, 2);
    expect(sim.sofiyka.mode).toBe('RUN');

    sim.step(NO_INPUT);
    expect(sim.sofiyka.mode).toBe('IDLE');
    sim.dispose();
  });

  it.each(['solid', 'bars'] as const)('stops in front of a %s block', async (kind) => {
    const wall: Block = {
      kind,
      center: { x: 0, y: 1, z: 3 },
      halfExtents: { x: 5, y: 1, z: 0.5 },
    }; // near face at z = 2.5
    const sim = await createSim(levelWith(wall));
    run(sim, 120, FORWARD);

    const z = sim.sofiyka.position.z;
    expect(z).toBeLessThanOrEqual(2.5 - 0.4 + 0.02);
    expect(z).toBeGreaterThan(1.8);
    sim.dispose();
  });

  it('reports distance to the nearest solid block with rayDistance', async () => {
    const wall: Block = {
      kind: 'solid',
      center: { x: 0, y: 1, z: 5 },
      halfExtents: { x: 5, y: 1, z: 0.5 },
    };
    const sim = await createSim(levelWith(wall));
    const d = sim.rayDistance({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 10);
    expect(d).toBeCloseTo(4.5, 2);
    expect(sim.rayDistance({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 10)).toBe(10);
    sim.dispose();
  });
});
