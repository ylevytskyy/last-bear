import { describe, expect, it } from 'vitest';
import { NO_INPUT, type Input } from './input';
import type { Block, Level } from './level';
import { createSim } from './sim';

const FLOOR: Block = {
  kind: 'solid',
  center: { x: 0, y: -0.5, z: 0 },
  halfExtents: { x: 30, y: 0.5, z: 30 },
};
const level = (...blocks: Block[]): Level => ({
  blocks: [FLOOR, ...blocks],
  spawn: { x: 0, y: 0, z: 0 },
  killY: -20,
});
const BLINK: Input = { ...NO_INPUT, blink: true };
const wallAt = (kind: Block['kind'], z: number, halfZ: number): Block => ({
  kind,
  center: { x: 0, y: 1, z },
  halfExtents: { x: 10, y: 1, z: halfZ },
});

describe('Blink', () => {
  it('jumps 6 m ahead in one step and starts the 2 s cooldown', async () => {
    const sim = await createSim(level());
    const events = sim.step(BLINK);
    expect(sim.sofiyka.position.z).toBeCloseTo(6, 1);
    expect(sim.sofiyka.position.x).toBeCloseTo(0, 2);
    expect(sim.sofiyka.blinkCooldown).toBeCloseTo(2, 5);
    expect(sim.sofiyka.mode).toBe('BLINK');
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.type).toBe('blinked');
    if (e.type === 'blinked') {
      expect(e.from.z).toBeCloseTo(0, 2);
      expect(e.to.z).toBeCloseTo(6, 1);
    }
    sim.dispose();
  });

  it('goes in the direction Sofiyka faces', async () => {
    const sim = await createSim(level());
    sim.step({ ...NO_INPUT, moveX: 1 }); // faces +x
    const before = sim.sofiyka.position.x;
    sim.step(BLINK);
    expect(sim.sofiyka.position.x - before).toBeCloseTo(6, 0);
    sim.dispose();
  });

  it('stops in front of a solid wall', async () => {
    const sim = await createSim(level(wallAt('solid', 3.5, 0.5))); // near face z = 3
    sim.step(BLINK);
    const z = sim.sofiyka.position.z;
    expect(z).toBeLessThanOrEqual(3 - 0.4 + 0.01);
    expect(z).toBeGreaterThan(2);
    sim.dispose();
  });

  it('passes through bars to the free place behind them', async () => {
    const sim = await createSim(level(wallAt('bars', 3.1, 0.1)));
    sim.step(BLINK);
    expect(sim.sofiyka.position.z).toBeGreaterThan(3.2 + 0.4);
    sim.dispose();
  });

  it('steps back along the path when the arrival spot is occupied', async () => {
    const sim = await createSim(level(wallAt('bars', 6, 0.5))); // arrival at z=6 sits inside the bars
    sim.step(BLINK);
    const z = sim.sofiyka.position.z;
    expect(z).toBeLessThanOrEqual(5.5 - 0.4 + 0.01);
    expect(z).toBeGreaterThan(4);
    sim.dispose();
  });

  it('does nothing and keeps the cooldown free when there is no room', async () => {
    const sim = await createSim(level(wallAt('solid', 0.7, 0.2))); // near face z = 0.5, capsule would need 0.4
    const events = sim.step(BLINK);
    expect(events).toEqual([]);
    expect(sim.sofiyka.blinkCooldown).toBe(0);
    expect(sim.sofiyka.position.z).toBeCloseTo(0, 2);
    sim.dispose();
  });

  it('refuses a second Blink within 2 s and works again after 120 steps', async () => {
    const sim = await createSim(level());
    sim.step(BLINK);
    sim.step(NO_INPUT);
    const z1 = sim.sofiyka.position.z;
    expect(sim.step(BLINK)).toEqual([]);
    expect(sim.sofiyka.position.z).toBeCloseTo(z1, 2);

    const early = await createSim(level());
    early.step(BLINK);
    for (let i = 0; i < 118; i++) early.step(NO_INPUT);
    expect(early.step(BLINK)).toEqual([]); // 119 steps after the Blink: 1.983 s left

    const ready = await createSim(level());
    ready.step(BLINK);
    for (let i = 0; i < 119; i++) ready.step(NO_INPUT);
    expect(ready.sofiyka.blinkCooldown).toBeGreaterThan(0);
    expect(ready.step(BLINK)).toHaveLength(1); // 120 steps after the Blink
    sim.dispose();
    early.dispose();
    ready.dispose();
  });

  it('zeroes vertical speed when blinking in the air', async () => {
    const sim = await createSim(level());
    sim.step({ ...NO_INPUT, jump: true });
    for (let i = 0; i < 5; i++) sim.step(NO_INPUT);
    expect(sim.sofiyka.velocityY).toBeGreaterThan(0);
    sim.step(BLINK);
    expect(sim.sofiyka.velocityY).toBe(0);
    sim.dispose();
  });
});
