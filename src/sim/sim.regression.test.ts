import { describe, expect, it } from 'vitest';
import { NO_INPUT, type Input } from './input';
import type { Block, Level } from './level';
import { createSim, type SimEvent } from './sim';

const FLOOR: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 30, y: 0.5, z: 30 } };
const level = (blocks: Block[] = [FLOOR], spawn = { x: 0, y: 0, z: 0 }): Level => ({ blocks, spawn, killY: -20 });

describe('floor contact', () => {
  it('stays on the floor when idle exactly on a diagonal of the floor block', async () => {
    const sim = await createSim(level());
    for (let i = 0; i < 120; i++) sim.step(NO_INPUT);
    expect(sim.sofiyka.position.y).toBeGreaterThan(-0.05);
    expect(sim.sofiyka.position.y).toBeLessThan(0.05);
    sim.dispose();
  });

  it('stays on the floor walking along a diagonal', async () => {
    const sim = await createSim(level([FLOOR], { x: -8, y: 0, z: -8 }));
    for (let i = 0; i < 120; i++) sim.step({ ...NO_INPUT, moveX: 0.707, moveZ: 0.707 });
    expect(sim.sofiyka.position.y).toBeGreaterThan(-0.05);
    expect(sim.sofiyka.position.y).toBeLessThan(0.05);
    sim.dispose();
  });
});

describe('ceiling', () => {
  it('loses upward speed when her head hits a ceiling', async () => {
    const ceiling: Block = { kind: 'solid', center: { x: 0, y: 2.5, z: 0 }, halfExtents: { x: 5, y: 0.5, z: 5 } }; // underside y = 2
    const sim = await createSim(level([FLOOR, ceiling]));
    sim.step({ ...NO_INPUT, jump: true });
    let bumped = -1;
    for (let i = 0; i < 40; i++) {
      sim.step({ ...NO_INPUT, jump: true });
      if (sim.sofiyka.position.y + 1.4 >= 1.95 && bumped < 0) bumped = i;
      if (bumped >= 0 && i >= bumped + 2) break;
    }
    expect(bumped).toBeGreaterThanOrEqual(0);
    expect(sim.sofiyka.velocityY).toBeLessThanOrEqual(0);
    sim.dispose();
  });
});

describe('return after a fall', () => {
  it('does not report a landing for the return', async () => {
    const platform: Block = { ...FLOOR, halfExtents: { x: 3, y: 0.5, z: 3 } };
    const sim = await createSim({ blocks: [platform], spawn: { x: 0, y: 0, z: 0 }, killY: -5 });
    const events: SimEvent[] = [];
    for (let i = 0; i < 400; i++) events.push(...sim.step({ ...NO_INPUT, moveZ: i < 200 ? 1 : 0 }));
    const types = events.map((e) => e.type);
    expect(types).toContain('returned');
    expect(types.join(',')).not.toContain('landed');
    sim.dispose();
  });
});

describe('Blink key held down', () => {
  it('fires once, not again when the cooldown ends while still held', async () => {
    const sim = await createSim(level());
    const held: Input = { ...NO_INPUT, blink: true };
    let blinks = 0;
    for (let i = 0; i < 200; i++) blinks += sim.step(held).filter((e) => e.type === 'blinked').length;
    expect(blinks).toBe(1);
    sim.dispose();
  });
});
