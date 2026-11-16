import { describe, expect, it } from 'vitest';
import { VILLAGE } from '../levels/village';
import { NO_INPUT, type Input } from './input';
import type { Block, Level, Vec3 } from './level';
import { createGuideBot, playScenario, sleeperBot, type Bot } from './scenario';
import { createSim, type SimEvent } from './sim';
import { TUNING } from './tuning';

const types = (events: SimEvent[]) => events.map((e) => e.type);
const real = VILLAGE.cages!.find((c) => c.working)!;
const yellow = VILLAGE.flowers!.find((f) => f.opens)!;
const entered = (events: SimEvent[]) => events.some((e) => e.type === 'flowerEntered');
const opened = (events: SimEvent[]) => events.some((e) => e.type === 'cageOpened');

describe('playScenario with until', () => {
  const FLOOR: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 10, y: 0.5, z: 10 } };
  const empty: Level = { blocks: [FLOOR], spawn: { x: 0, y: 0, z: 0 }, killY: -10 };
  const jumper: Bot = (_sim, i) => ({ ...NO_INPUT, jump: i === 5 });

  it('stops on the first step where it is true, and reports that step as the last one', async () => {
    const sim = await createSim(empty);
    const run = playScenario(sim, jumper, 500, (events) => events.some((e) => e.type === 'jumped'));
    expect(run.steps).toBe(6);
    expect(types(run.events)).toEqual(['jumped']);
    sim.dispose();
  });

  it('runs to maxSteps when it never turns true, even with no enemies in the level', async () => {
    const sim = await createSim(empty);
    const run = playScenario(sim, sleeperBot, 40, () => false);
    expect(run.steps).toBe(40);
    sim.dispose();
  });

  it('without until, a level with no enemies ends at once (as in the arena run-through)', async () => {
    const sim = await createSim(empty);
    expect(playScenario(sim, sleeperBot, 40).steps).toBe(0);
    sim.dispose();
  });
});

describe('village run-through (Проходження)', () => {
  it('without a key the guide bot follows the trail to the yellow flower and jumps into it, at full hearts', async () => {
    const sim = await createSim(VILLAGE);
    const run = playScenario(sim, createGuideBot(VILLAGE), 6000, entered);
    expect(run.events.filter((e) => e.type === 'flowerEntered')).toEqual([{ type: 'flowerEntered', id: yellow.id }]);
    expect(run.steps).toBeLessThan(6000);
    expect(sim.sofiyka.hearts).toBe(TUNING.hearts);
    expect(types(run.events)).not.toContain('cageOpened');
    sim.dispose();
  });

  it('waits for a slowly opening bud: one jump in the whole run, and it is the one that enters', async () => {
    const slow = { ...TUNING, village: { ...TUNING.village, flowerOpenSeconds: 3 } };
    const sim = await createSim(VILLAGE, slow);
    const run = playScenario(sim, createGuideBot(VILLAGE), 6000, entered);
    expect(run.events.filter((e) => e.type === 'jumped')).toHaveLength(1);
    expect(run.events.filter((e) => e.type === 'flowerEntered')).toEqual([{ type: 'flowerEntered', id: yellow.id }]);
    sim.dispose();
  });

  it('with a key it follows the other trail and opens the real cage, at full hearts', async () => {
    const sim = await createSim(VILLAGE, TUNING, { keys: 1 });
    const run = playScenario(sim, createGuideBot(VILLAGE), 6000, opened);
    expect(run.events.filter((e) => e.type === 'cageOpened')).toEqual([{ type: 'cageOpened', id: real.id }]);
    expect(run.steps).toBeLessThan(6000);
    expect(sim.sofiyka.keys).toBe(0);
    expect(sim.sofiyka.hearts).toBe(TUNING.hearts);
    expect(types(run.events)).not.toContain('flowerEntered');
    sim.dispose();
  });

  it('after the captive is free the bot has nowhere to go and stands still', async () => {
    const sim = await createSim(VILLAGE, TUNING, { keys: 1 });
    const bot = createGuideBot(VILLAGE);
    playScenario(sim, bot, 6000, opened);
    const where = { ...sim.sofiyka.position };
    playScenario(sim, bot, 300, () => false);
    expect(Math.hypot(sim.sofiyka.position.x - where.x, sim.sofiyka.position.z - where.z)).toBeLessThan(0.1);
    sim.dispose();
  });

  it('the sleeper loses no heart in the village in 3000 steps', async () => {
    const sim = await createSim(VILLAGE);
    const run = playScenario(sim, sleeperBot, 3000, () => false);
    expect(run.steps).toBe(3000);
    expect(types(run.events)).not.toContain('heartLost');
    sim.dispose();
  });

  it('the sleeper loses no heart in 3000 steps at the checkpoint in front of the open cage', async () => {
    const sim = await createSim(VILLAGE, TUNING, { keys: 1 });
    playScenario(sim, createGuideBot(VILLAGE), 6000, opened);
    // Стає на Контрольну точку перед Кліткою й засинає.
    const walkTo = (to: Vec3): Bot => (s) => {
      const p = s.sofiyka.position;
      const d = Math.hypot(to.x - p.x, to.z - p.z);
      const input: Input = d < 0.05 ? NO_INPUT : { ...NO_INPUT, moveX: (to.x - p.x) / d, moveZ: (to.z - p.z) / d };
      return input;
    };
    playScenario(sim, walkTo(sim.checkpoint), 300, () => false);
    expect(Math.hypot(sim.sofiyka.position.x - sim.checkpoint.x, sim.sofiyka.position.z - sim.checkpoint.z)).toBeLessThan(0.1);
    const run = playScenario(sim, sleeperBot, 3000, () => false);
    expect(types(run.events)).not.toContain('heartLost');
    sim.dispose();
  });

  it('the guide bot answers an attack on the way with a Reflex, as the child does', async () => {
    const level: Level = { ...VILLAGE, enemies: [{ id: 'bee', kind: 'bee', position: { x: 5, y: 1.5, z: -9 }, facing: Math.PI }] };
    const sim = await createSim(level);
    const run = playScenario(sim, createGuideBot(level), 1200, (events) => events.some((e) => e.type === 'reflexed'));
    expect(types(run.events)).toContain('windowOpened');
    expect(types(run.events)).toContain('reflexed');
    expect(run.events).toContainEqual({ type: 'windowClosed', reflexed: true });
    sim.dispose();
  });
});
