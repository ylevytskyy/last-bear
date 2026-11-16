import { describe, expect, it } from 'vitest';
import { HONEYCOMBS } from '../levels/honeycombs';
import { VILLAGE } from '../levels/village';
import { WORLDS } from '../levels/worlds';
import { createGame, singleWorldGame, type Game, type GameEvent, type Worlds } from './game';
import { NO_INPUT, type Input } from './input';
import type { Block, Level, Vec3 } from './level';
import { createGuideBot } from './scenario';
import { createSimNow, initRules, type Sim, type SimEvent } from './sim';
import { TUNING } from './tuning';

const T = TUNING.worlds.transitionSeconds;
const STEPS_HALF = Math.round(T / 2 / TUNING.step);
const types = (events: GameEvent[]) => events.map((e) => e.type);
const yellow = VILLAGE.flowers!.find((f) => f.color === 'yellow')!;
const real = VILLAGE.cages!.find((c) => c.working)!;
const block = (x: number, y: number, z: number, hx: number, hy: number, hz: number): Block => ({
  kind: 'solid',
  center: { x, y, z },
  halfExtents: { x: hx, y: hy, z: hz },
});
const FLOOR = block(0, -0.5, 0, 20, 0.5, 20);
/** Тестові кімнати: світи Залаштунків і Стільників тут свої, щоб тест не залежав від справжніх рівнів. */
const ROOM_BACK: Level = {
  blocks: [FLOOR],
  spawn: { x: 0, y: 0, z: -8 },
  killY: -10,
  flowers: [{ id: 'to-village', position: { x: 0, y: 0, z: 8 }, color: 'pink', opens: true, to: 'village' }],
};
const ROOM_HONEY: Level = {
  blocks: [FLOOR],
  spawn: { x: 0, y: 0, z: 0 },
  killY: -10,
  entries: { village: { x: -6, y: 0, z: -6 } },
  flowers: [{ id: 'back', position: { x: 0, y: 0, z: 8 }, color: 'yellow', opens: true, to: 'village' }],
};
const TEST_WORLDS: Worlds = { backrooms: ROOM_BACK, village: VILLAGE, honeycombs: ROOM_HONEY };

const stepWith = (game: Game, input: Input): GameEvent[] => game.step(input);
function steps(game: Game, n: number, input: Input = NO_INPUT): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...stepWith(game, input));
  return out;
}
/** Іде до точки по xz у поточному світі; не довше `max` кроків. */
function walk(game: Game, target: Vec3, stop = 0.1, max = 1500): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < max; i++) {
    const p = game.sim.sofiyka.position;
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    if (d < stop) return out;
    out.push(...stepWith(game, { ...NO_INPUT, moveX: (target.x - p.x) / d, moveZ: (target.z - p.z) / d }));
  }
  throw new Error('never got there');
}
/** Стає за 0.8 м перед Квіткою (зі сторони `from`), чекає розкриття й стрибає; повертає події до `worldLeft`. */
function jumpIntoFlower(game: Game, flower: { id: string; position: Vec3 }, from: Vec3): GameEvent[] {
  const dx = flower.position.x - from.x;
  const dz = flower.position.z - from.z;
  const d = Math.hypot(dx, dz);
  const stand = { x: flower.position.x - (dx / d) * 0.8, y: 0, z: flower.position.z - (dz / d) * 0.8 };
  const out = walk(game, stand, 0.05);
  for (let i = 0; i < 300 && !types(out).includes('worldLeft'); i++) {
    const open = (game.sim.flowers.find((f) => f.id === flower.id)?.openness ?? 0) >= 1 - 1e-6;
    out.push(...stepWith(game, { ...NO_INPUT, jump: (open && game.sim.sofiyka.grounded && i % 2 === 0) || (game.sim.sofiyka.velocityY > 0 && !game.sim.sofiyka.grounded) }));
  }
  return out;
}
/** Крокує, поки `transition` > 0. */
function finishTransition(game: Game): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < 400 && game.transition > 0; i++) out.push(...stepWith(game, NO_INPUT));
  return out;
}

describe('the game of three worlds: a jump into the yellow flower', () => {
  it('worldLeft, then worldEntered half a transition later, Sofiyka at the honeycombs entry, transition 0 after a whole one', async () => {
    const game = await createGame(WORLDS, TUNING, { world: 'village' });
    expect(game.world).toBe('village');
    expect(game.level).toBe(WORLDS.village);
    expect(game.transition).toBe(0);
    const first = game.sim;
    const bot = createGuideBot(VILLAGE);
    const events: GameEvent[] = [];
    let i = 0;
    for (; i < 3000 && !types(events).includes('worldLeft'); i++) events.push(...stepWith(game, bot(game.sim, i, [])));
    expect(events.filter((e) => e.type === 'worldLeft')).toEqual([{ type: 'worldLeft', from: 'village', to: 'honeycombs', color: 'yellow' }]);
    expect(types(events)).toContain('flowerEntered');
    expect(game.transition).toBeCloseTo(T, 9);
    expect(game.world).toBe('village'); // ще не змінився: екран заливається
    expect(game.sim).toBe(first);

    // До середини переходу світ той самий; на середині — worldEntered.
    let stepsToEnter = 0;
    const after: GameEvent[] = [];
    while (!types(after).includes('worldEntered') && stepsToEnter < 200) {
      after.push(...stepWith(game, NO_INPUT));
      stepsToEnter++;
    }
    expect(Math.abs(stepsToEnter - STEPS_HALF)).toBeLessThanOrEqual(1);
    expect(after.filter((e) => e.type === 'worldEntered')).toEqual([{ type: 'worldEntered', world: 'honeycombs', from: 'village' }]);
    expect(game.world).toBe('honeycombs');
    expect(game.level).toBe(WORLDS.honeycombs);
    expect(game.sim).not.toBe(first);
    expect(game.sim.sofiyka.position).toEqual(HONEYCOMBS.entries!.village);
    expect(game.sim.checkpoint).toEqual(HONEYCOMBS.entries!.village);
    expect(game.transition).toBeGreaterThan(0);

    const rest = finishTransition(game);
    expect(types(rest)).not.toContain('worldEntered');
    expect(game.transition).toBe(0);
    game.dispose();
  });

  it('the transition takes transitionSeconds in all: the first step after it moves her again', async () => {
    const game = await createGame(TEST_WORLDS, TUNING, { world: 'village' });
    jumpIntoFlower(game, yellow, VILLAGE.entries!.backrooms!);
    let n = 0;
    while (game.transition > 0 && n < 400) {
      game.step(NO_INPUT);
      n++;
    }
    expect(Math.abs(n - Math.round(T / TUNING.step))).toBeLessThanOrEqual(1);
    const before = { ...game.sim.sofiyka.position };
    steps(game, 20, { ...NO_INPUT, moveX: 1 });
    expect(game.sim.sofiyka.position.x).toBeGreaterThan(before.x + 1);
    game.dispose();
  });

  it('a flower with a destination does not put her on the checkpoint; one without still does', async () => {
    await initRules();
    const to = createSimNow({ ...ROOM_BACK, spawn: { x: 0, y: 0, z: 6 } });
    const events: SimEvent[] = [];
    for (let i = 0; i < 400 && !events.some((e) => e.type === 'flowerEntered'); i++) {
      const p = to.sofiyka.position;
      const d = Math.hypot(0 - p.x, 7.2 - p.z);
      const open = (to.flowers[0]?.openness ?? 0) >= 1 - 1e-6;
      events.push(...to.step({ ...NO_INPUT, moveX: d > 0.05 ? (0 - p.x) / d : 0, moveZ: d > 0.05 ? (7.2 - p.z) / d : 0, jump: (open && d < 0.1 && to.sofiyka.grounded) || (to.sofiyka.velocityY > 0 && !to.sofiyka.grounded) }));
    }
    expect(events.some((e) => e.type === 'flowerEntered')).toBe(true);
    expect(Math.hypot(to.sofiyka.position.x, to.sofiyka.position.z - 6)).toBeGreaterThan(0.5); // не на Контрольній точці
    to.dispose();
  });
});
describe('what survives a trip through a flower', () => {
  it('keys, open cages and hearts are the same after Village → Honeycombs → Village', async () => {
    let made = 0;
    const makeSim: typeof createSimNow = (level, tuning, start) => {
      made++;
      return createSimNow(level, tuning, made === 1 ? { ...start, hearts: 3 } : start); // перший світ починає із трьома Серцями
    };
    const game = await createGame(TEST_WORLDS, TUNING, { world: 'village', keys: 2 }, makeSim);
    expect(game.sim.sofiyka.hearts).toBe(3);

    // Відкриває справжню Клітку Ключем із двох.
    const bot = createGuideBot(VILLAGE);
    for (let i = 0; i < 6000 && !game.sim.cages.some((c) => c.open); i++) game.step(bot(game.sim, i, []));
    expect(game.sim.cages.find((c) => c.id === real.id)!.open).toBe(true);
    expect(game.sim.sofiyka.keys).toBe(1);

    // До Квітки.
    const left = jumpIntoFlower(game, yellow, { x: 0, y: 0, z: 12 });
    expect(types(left)).toContain('worldLeft');
    finishTransition(game);
    expect(game.world).toBe('honeycombs');
    expect(game.sim.sofiyka.keys).toBe(1);
    expect(game.sim.sofiyka.hearts).toBe(3);
    expect(game.sim.cages).toEqual([]); // у Стільниках Кліток немає

    // Назад.
    const back = jumpIntoFlower(game, ROOM_HONEY.flowers![0]!, ROOM_HONEY.entries!.village!);
    expect(back.filter((e) => e.type === 'worldLeft')).toEqual([{ type: 'worldLeft', from: 'honeycombs', to: 'village', color: 'yellow' }]);
    finishTransition(game);
    expect(game.world).toBe('village');
    expect(game.sim.sofiyka.keys).toBe(1);
    expect(game.sim.sofiyka.hearts).toBe(3);
    expect(game.sim.cages.filter((c) => c.open).map((c) => c.id)).toEqual([real.id]);
    expect(game.sim.sofiyka.position).toEqual(VILLAGE.entries!.honeycombs);
    expect(made).toBe(3);
    game.dispose();
  });

  it('an open cage has no door when she is back: she walks into it', async () => {
    const game = await createGame(TEST_WORLDS, TUNING, { world: 'village', keys: 1 });
    const bot = createGuideBot(VILLAGE);
    for (let i = 0; i < 6000 && !game.sim.cages.some((c) => c.open); i++) game.step(bot(game.sim, i, []));
    jumpIntoFlower(game, yellow, { x: 0, y: 0, z: 12 });
    finishTransition(game);
    jumpIntoFlower(game, ROOM_HONEY.flowers![0]!, ROOM_HONEY.entries!.village!);
    finishTransition(game);
    walk(game, { x: real.position.x, y: 0, z: real.position.z - 3 });
    walk(game, { x: real.position.x, y: 0, z: real.position.z }, 0.1, 600);
    expect(game.sim.sofiyka.position.z).toBeGreaterThan(real.position.z - 0.3);
    game.dispose();
  });
});

describe('the old Sim is freed once per transition and she does not move during it', () => {
  function spied() {
    const disposed: Sim[] = [];
    const made: Sim[] = [];
    const makeSim: typeof createSimNow = (level, tuning, start) => {
      const sim = createSimNow(level, tuning, start);
      const dispose = sim.dispose.bind(sim);
      sim.dispose = () => {
        disposed.push(sim);
        dispose();
      };
      made.push(sim);
      return sim;
    };
    return { disposed, made, makeSim };
  }

  it('exactly one dispose per transition, of the sim that was left, at the moment the new one is made', async () => {
    const { disposed, made, makeSim } = spied();
    const game = await createGame(TEST_WORLDS, TUNING, { world: 'village' }, makeSim);
    expect(made).toHaveLength(1);
    jumpIntoFlower(game, yellow, VILLAGE.entries!.backrooms!);
    expect(disposed).toHaveLength(0); // ще в першій половині: старий світ живий
    while (made.length < 2) game.step(NO_INPUT);
    expect(disposed).toEqual([made[0]]);
    finishTransition(game);
    expect(disposed).toHaveLength(1);
    jumpIntoFlower(game, ROOM_HONEY.flowers![0]!, ROOM_HONEY.entries!.village!);
    finishTransition(game);
    expect(disposed).toEqual([made[0], made[1]]);
    expect(made).toHaveLength(3);
    game.dispose();
    expect(disposed).toEqual([made[0], made[1], made[2]]);
  });

  it('keys held down during the transition do not move her, before the switch or after it', async () => {
    const game = await createGame(TEST_WORLDS, TUNING, { world: 'village' });
    jumpIntoFlower(game, yellow, VILLAGE.entries!.backrooms!);
    const old = game.sim;
    const where = { ...old.sofiyka.position };
    steps(game, STEPS_HALF - 3, { ...NO_INPUT, moveX: 1, moveZ: 1 });
    expect(game.sim).toBe(old);
    expect(game.sim.sofiyka.position).toEqual(where);
    expect(game.sim.time).toBe(old.time);
    while (game.sim === old) game.step({ ...NO_INPUT, moveX: 1 });
    const entry = { ...game.sim.sofiyka.position };
    const time = game.sim.time;
    steps(game, 10, { ...NO_INPUT, moveX: 1, jump: true });
    expect(game.transition).toBeGreaterThan(0);
    expect(game.sim.sofiyka.position).toEqual(entry);
    expect(game.sim.time).toBe(time);
    game.dispose();
  });
});

describe('where she is let in', () => {
  it('a start from another world stands at that world entry for it, and at the level spawn without one', async () => {
    const withFrom = await createGame(WORLDS, TUNING, { world: 'honeycombs', from: 'village' });
    expect(withFrom.world).toBe('honeycombs');
    expect(withFrom.sim.sofiyka.position).toEqual(HONEYCOMBS.entries!.village);
    withFrom.dispose();
    const without = await createGame(WORLDS, TUNING, { world: 'honeycombs' });
    expect(without.sim.sofiyka.position).toEqual(HONEYCOMBS.spawn);
    without.dispose();
    const fallback = await createGame(TEST_WORLDS, TUNING, { world: 'village', from: 'honeycombs' }); // у Селища є entries.honeycombs
    expect(fallback.sim.sofiyka.position).toEqual(VILLAGE.entries!.honeycombs);
    fallback.dispose();
    const missing = await createGame(TEST_WORLDS, TUNING, { world: 'honeycombs', from: 'backrooms' }); // входу з Залаштунків немає
    expect(missing.sim.sofiyka.position).toEqual(ROOM_HONEY.spawn);
    missing.dispose();
  });

  it('starts at the backrooms by default, with the keys it is given', async () => {
    const game = await createGame(TEST_WORLDS, TUNING, { keys: 2 });
    expect(game.world).toBe('backrooms');
    expect(game.sim.sofiyka.keys).toBe(2);
    game.dispose();
  });

  it('every entry of the village is farther than aggroRadius + 1 m from every enemy of it', () => {
    const entries = Object.entries(VILLAGE.entries!);
    expect(entries.map(([k]) => k).sort()).toEqual(['backrooms', 'honeycombs']);
    for (const [from, at] of entries) {
      for (const e of VILLAGE.enemies!) {
        const aggro = e.kind === 'bee' ? TUNING.bee.aggroRadius : TUNING.turtle.aggroRadius;
        const d =
          e.kind === 'turtle'
            ? Math.hypot(at.x - e.position.x, at.z - e.position.z)
            : Math.hypot(at.x - e.position.x, at.y + TUNING.capsuleHeight / 2 - e.position.y, at.z - e.position.z);
        expect(d, `entry from ${from} vs ${e.id}`).toBeGreaterThan(aggro + 1);
      }
    }
  });

  it('the honeycombs entry from the village is on the honeycombs ground, and the village one beside the yellow flower', () => {
    expect(VILLAGE.entries!.honeycombs).toBeDefined();
    expect(Math.hypot(VILLAGE.entries!.honeycombs!.x - yellow.position.x, VILLAGE.entries!.honeycombs!.z - yellow.position.z)).toBeLessThan(6);
    expect(Math.hypot(VILLAGE.entries!.honeycombs!.x - yellow.position.x, VILLAGE.entries!.honeycombs!.z - yellow.position.z)).toBeGreaterThan(TUNING.village.flowerEnterRadius + 0.5);
    expect(VILLAGE.entries!.backrooms).toEqual(VILLAGE.spawn);
    expect(yellow.to).toBe('honeycombs');
  });
});

describe('singleWorldGame', () => {
  it('passes the steps of one sim through and never leaves: a flower with a destination changes nothing', async () => {
    await initRules();
    const level: Level = { ...ROOM_BACK, spawn: { x: 0, y: 0, z: 6 } };
    const sim = createSimNow(level);
    const game = singleWorldGame(sim, level);
    expect(game.sim).toBe(sim);
    expect(game.level).toBe(level);
    expect(game.transition).toBe(0);
    const events: GameEvent[] = [];
    for (let i = 0; i < 400 && !types(events).includes('flowerEntered'); i++) {
      const p = game.sim.sofiyka.position;
      const d = Math.hypot(0 - p.x, 7.2 - p.z);
      const open = (game.sim.flowers[0]?.openness ?? 0) >= 1 - 1e-6;
      events.push(...game.step({ ...NO_INPUT, moveX: d > 0.05 ? (0 - p.x) / d : 0, moveZ: d > 0.05 ? (7.2 - p.z) / d : 0, jump: (open && d < 0.1 && game.sim.sofiyka.grounded) || (game.sim.sofiyka.velocityY > 0 && !game.sim.sofiyka.grounded) }));
    }
    expect(types(events)).toContain('flowerEntered');
    expect(types(events)).not.toContain('worldLeft');
    expect(game.transition).toBe(0);
    expect(game.sim).toBe(sim);
    steps(game, 10, { ...NO_INPUT, moveX: 1 });
    expect(game.sim.time).toBeGreaterThan(0);
    game.dispose();
  });
});
