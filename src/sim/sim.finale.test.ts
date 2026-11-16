import { describe, expect, it } from 'vitest';
import { VILLAGE } from '../levels/village';
import { createGame, singleWorldGame, type GameEvent } from './game';
import { NO_INPUT } from './input';
import type { Vec3 } from './level';
import { createGuideBot } from './scenario';
import { createSimNow, initRules } from './sim';
import { TUNING } from './tuning';

const WORLDS_VILLAGE = { backrooms: VILLAGE, village: VILLAGE, honeycombs: VILLAGE };
const decorative = VILLAGE.cages!.find((c) => !c.working)!;
const types = (events: readonly { type: string }[]) => events.map((e) => e.type);

describe('the finale: the real cage opened with a key is the end of the slice', () => {
  it('sliceComplete comes in the very step of cageOpened, and Game.complete turns true', async () => {
    const game = await createGame(WORLDS_VILLAGE, TUNING, { world: 'village', keys: 1 });
    const bot = createGuideBot(VILLAGE);
    expect(game.complete).toBe(false);
    let opened: GameEvent[] = [];
    for (let i = 0; i < 6000 && !types(opened).includes('cageOpened'); i++) {
      opened = game.step(bot(game.sim, i, []));
      if (!types(opened).includes('cageOpened')) expect(game.complete).toBe(false);
    }
    expect(types(opened)).toContain('cageOpened');
    expect(types(opened)).toContain('sliceComplete');
    expect(game.complete).toBe(true);
    game.dispose();
  });

  it('sliceComplete is sent once, and a single-world game reports complete too', async () => {
    await initRules();
    const sim = createSimNow(VILLAGE, TUNING, { keys: 1 });
    const game = singleWorldGame(sim, VILLAGE);
    const bot = createGuideBot(VILLAGE);
    const all: GameEvent[] = [];
    for (let i = 0; i < 6600; i++) all.push(...game.step(i < 6000 ? bot(game.sim, i, []) : NO_INPUT));
    expect(all.filter((e) => e.type === 'sliceComplete')).toHaveLength(1);
    expect(game.complete).toBe(true);
    game.dispose();
  });

  it('a decorative cage does not finish the slice, key or not', async () => {
    const game = await createGame(WORLDS_VILLAGE, TUNING, { world: 'village', keys: 1 });
    const door: Vec3 = { x: decorative.position.x, y: 0, z: decorative.position.z - TUNING.village.cageSize / 2 - 0.2 };
    const events: GameEvent[] = [];
    for (let i = 0; i < 1500; i++) {
      const p = game.sim.sofiyka.position;
      const d = Math.hypot(door.x - p.x, door.z - p.z);
      events.push(...game.step(d > 0.05 ? { ...NO_INPUT, moveX: (door.x - p.x) / d, moveZ: (door.z - p.z) / d } : NO_INPUT));
    }
    expect(Math.hypot(game.sim.sofiyka.position.x - door.x, game.sim.sofiyka.position.z - door.z)).toBeLessThan(0.3);
    expect(types(events)).not.toContain('cageOpened');
    expect(types(events)).not.toContain('sliceComplete');
    expect(game.sim.sofiyka.keys).toBe(1);
    expect(game.complete).toBe(false);
    game.dispose();
  });

  it('without a key the real cage stays closed and nothing completes', async () => {
    const game = await createGame(WORLDS_VILLAGE, TUNING, { world: 'village', keys: 0 });
    const events: GameEvent[] = [];
    // Доріжка без Ключа веде до Квітки; ставимо Софійку просто до дверей справжньої Клітки.
    const real = VILLAGE.cages!.find((c) => c.working)!;
    const door: Vec3 = { x: real.position.x, y: 0, z: real.position.z - TUNING.village.cageSize / 2 - 0.2 };
    for (let i = 0; i < 1500; i++) {
      const p = game.sim.sofiyka.position;
      const d = Math.hypot(door.x - p.x, door.z - p.z);
      events.push(...game.step(d > 0.05 ? { ...NO_INPUT, moveX: (door.x - p.x) / d, moveZ: (door.z - p.z) / d } : NO_INPUT));
    }
    expect(types(events)).not.toContain('cageOpened');
    expect(types(events)).not.toContain('sliceComplete');
    expect(game.complete).toBe(false);
    game.dispose();
  });
});
