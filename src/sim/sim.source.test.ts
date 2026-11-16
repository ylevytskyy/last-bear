import { describe, expect, it } from 'vitest';
import { NO_INPUT, type Input } from './input';
import type { Block, FlowerSpawn, Level, Vec3 } from './level';
import { createSim, type Sim, type SimEvent } from './sim';
import { sourceBlock } from './source';
import { TUNING } from './tuning';
import { levelBlocks } from './village-geometry';

const types = (events: SimEvent[]) => events.map((e) => e.type);
const block = (x: number, y: number, z: number, hx: number, hy: number, hz: number): Block => ({
  kind: 'solid',
  center: { x, y, z },
  halfExtents: { x: hx, y: hy, z: hz },
});
const SOURCE = { id: 'source', position: { x: 0, y: 0, z: 4 } };
/** Площа 16×18 м: край на x = ±8 (за ним прірва), Джерело в (0, 0, 4), Софійка на (0, 0, 0). */
const ARENA: Level = {
  blocks: [block(0, -0.5, 3, 8, 0.5, 9)],
  spawn: { x: 0, y: 0, z: 0 },
  killY: -10,
  source: SOURCE,
};
/** Підбирати Ключ тільки впритул: тоді його видно між Ударом і підбиранням. */
const CLOSE: typeof TUNING = { ...TUNING, source: { ...TUNING.source, pickupRadius: 0.6 } };
const STRIKE: Input = { ...NO_INPUT, strike: true };

function steps(sim: Sim, n: number, input: Input = NO_INPUT): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...sim.step(input));
  return out;
}
/** Іде до точки по xz, доки не буде ближче за `stop`. */
function walk(sim: Sim, target: Vec3, stop = 0.05): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < 1500; i++) {
    const p = sim.sofiyka.position;
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    if (d < stop) return events;
    const scale = Math.min(1, d / 0.3); // притихає перед точкою, щоб не промахнутись
    events.push(...sim.step({ ...NO_INPUT, moveX: ((target.x - p.x) / d) * scale, moveZ: ((target.z - p.z) / d) * scale }));
  }
  throw new Error('never got there');
}
/** Один Удар: натиск, потім відпускання до кінця замаху. */
function strikeOnce(sim: Sim): SimEvent[] {
  return [...sim.step(STRIKE), ...steps(sim, 25)];
}
const sourceOf = (sim: Sim) => sim.source!;

describe('the source takes three strikes', () => {
  it('three separate strikes: sourceStruck with hp 2, 1, 0, then sourceBroken; none of them is a plain struck', async () => {
    const sim = await createSim(ARENA);
    expect(sourceOf(sim)).toEqual({ hp: 3, broken: false, keyAt: null });
    walk(sim, { x: 0, y: 0, z: 1.3 });
    steps(sim, 2, { ...NO_INPUT, moveZ: 1e-3 });
    const first = strikeOnce(sim);
    expect(first.filter((e) => e.type === 'sourceStruck')).toEqual([{ type: 'sourceStruck', hp: 2 }]);
    expect(sourceOf(sim).hp).toBe(2);
    const second = strikeOnce(sim);
    expect(second.filter((e) => e.type === 'sourceStruck')).toEqual([{ type: 'sourceStruck', hp: 1 }]);
    const third = strikeOnce(sim);
    expect(third.filter((e) => e.type === 'sourceStruck')).toEqual([{ type: 'sourceStruck', hp: 0 }]);
    expect(types(third)).toContain('sourceBroken');
    expect(types(third).indexOf('sourceStruck')).toBeLessThan(types(third).indexOf('sourceBroken'));
    expect([...first, ...second, ...third].filter((e) => e.type === 'struck')).toEqual([]);
    expect(types([...first, ...second]).includes('sourceBroken')).toBe(false);
    expect(sourceOf(sim).broken).toBe(true);
    expect(sourceOf(sim).hp).toBe(0);
    sim.dispose();
  });

  it('one swing counts once however many steps its hitbox stays on the source', async () => {
    const sim = await createSim(ARENA);
    walk(sim, { x: 0, y: 0, z: 1.3 });
    steps(sim, 2, { ...NO_INPUT, moveZ: 1e-3 });
    // Кнопка затиснута: фронт лише один, тож і Удар один.
    const events = steps(sim, 40, STRIKE);
    expect(events.filter((e) => e.type === 'sourceStruck')).toHaveLength(1);
    expect(sourceOf(sim).hp).toBe(2);
    sim.dispose();
  });

  it('a strike that does not reach is an ordinary miss: struck with no enemy, and the source is whole', async () => {
    const sim = await createSim(ARENA);
    const events = strikeOnce(sim); // за 4 м
    expect(events.filter((e) => e.type === 'struck')).toEqual([{ type: 'struck', enemyId: null, hit: false }]);
    expect(types(events)).not.toContain('sourceStruck');
    expect(sourceOf(sim).hp).toBe(3);
    sim.dispose();
  });

  it('a strike facing away from it does not hurt it', async () => {
    const sim = await createSim(ARENA);
    walk(sim, { x: 0, y: 0, z: 1.3 });
    steps(sim, 2, { ...NO_INPUT, moveZ: -1e-3 }); // спиною
    const events = strikeOnce(sim);
    expect(types(events)).not.toContain('sourceStruck');
    expect(sourceOf(sim).hp).toBe(3);
    sim.dispose();
  });

  it('a level without a source has none', async () => {
    const sim = await createSim({ ...ARENA, source: undefined });
    expect(sim.source).toBeNull();
    sim.dispose();
  });

  it('the cauldron is solid until it breaks, then she can walk through where it stood; levelBlocks has the same block', async () => {
    expect(levelBlocks(ARENA, new Set(), TUNING)).toContainEqual(sourceBlock(SOURCE, TUNING));
    const sim = await createSim(ARENA, CLOSE);
    walk(sim, { x: 0, y: 0, z: 1.3 }); // за 1.7 м до центра
    for (let i = 0; i < 120; i++) sim.step({ ...NO_INPUT, moveZ: 1 });
    expect(sim.sofiyka.position.z).toBeLessThan(SOURCE.position.z - 1.0 + 0.01); // впирається в грань
    expect(sim.sofiyka.position.z).toBeGreaterThan(SOURCE.position.z - 1.0 - TUNING.capsuleRadius - 0.1);
    walk(sim, { x: 0, y: 0, z: 1.3 }); // назад, щоб Ключ упав не під ноги
    steps(sim, 2, { ...NO_INPUT, moveZ: 1e-3 });
    strikeOnce(sim);
    strikeOnce(sim);
    strikeOnce(sim);
    expect(sourceOf(sim).broken).toBe(true);
    const p = sourceOf(sim).keyAt!;
    walk(sim, { x: p.x + 3, y: 0, z: p.z + 3 }); // відходить від Ключа, щоб не підібрати
    walk(sim, { x: 0, y: 0, z: SOURCE.position.z + 3 }, 0.1); // і йде крізь місце, де був казан
    for (let i = 0; i < 90; i++) sim.step({ ...NO_INPUT, moveZ: -1 });
    expect(sim.sofiyka.position.z).toBeLessThan(SOURCE.position.z - 1);
    sim.dispose();
  });
});

describe('the key', () => {
  it('drops keyDropDistance beyond the cauldron wall towards her, on the ground; she picks it up by walking close: keyPicked, keys 1, keyAt null', async () => {
    const sim = await createSim(ARENA, CLOSE);
    walk(sim, { x: 0, y: 0, z: 1.3 });
    steps(sim, 2, { ...NO_INPUT, moveZ: 1e-3 });
    const events = [...strikeOnce(sim), ...strikeOnce(sim), ...strikeOnce(sim)];
    expect(types(events)).toContain('sourceBroken');
    expect(types(events)).not.toContain('keyPicked');
    const key = sourceOf(sim).keyAt!;
    expect(key.x).toBeCloseTo(0, 3);
    expect(key.z).toBeCloseTo(SOURCE.position.z - TUNING.source.halfWidth - TUNING.source.keyDropDistance, 3);
    expect(key.y).toBe(0);
    expect(sim.sofiyka.keys).toBe(0);
    // Не підбирає, поки далі за pickupRadius.
    walk(sim, { x: 0, y: 0, z: key.z - 2 });
    steps(sim, 20);
    expect(sim.sofiyka.keys).toBe(0);
    const pick = walk(sim, { x: 0, y: 0, z: key.z - 0.3 }).concat(steps(sim, 3));
    expect(pick.filter((e) => e.type === 'keyPicked')).toEqual([{ type: 'keyPicked' }]);
    expect(sim.sofiyka.keys).toBe(1);
    expect(sourceOf(sim)).toEqual({ hp: 0, broken: true, keyAt: null });
    expect(types(steps(sim, 60))).not.toContain('keyPicked'); // один раз
    expect(sim.sofiyka.keys).toBe(1);
    sim.dispose();
  });

  it('is picked up from just inside pickupRadius and not from just outside it', async () => {
    const run = async (radius: number | null) => {
      const tuning = radius === null ? TUNING : { ...TUNING, source: { ...TUNING.source, pickupRadius: radius } };
      const sim = await createSim(ARENA, tuning);
      walk(sim, { x: 0, y: 0, z: 1.3 });
      steps(sim, 2, { ...NO_INPUT, moveZ: 1e-3 });
      const events = [...strikeOnce(sim), ...strikeOnce(sim), ...strikeOnce(sim), ...steps(sim, 10)];
      const out = { sim, picked: types(events).includes('keyPicked'), key: sim.source!.keyAt, she: { ...sim.sofiyka.position } };
      return out;
    };
    const probe = await run(0.1); // нічого не підбирає: міряємо відстань
    expect(probe.picked).toBe(false);
    const gap = Math.hypot(probe.key!.x - probe.she.x, probe.key!.z - probe.she.z);
    probe.sim.dispose();
    expect(gap).toBeGreaterThan(0.5);
    expect(gap).toBeLessThan(TUNING.source.pickupRadius + 1); // стоїть поруч
    const inside = await run(gap + 0.02);
    const outside = await run(gap - 0.02);
    expect(inside.picked).toBe(true);
    expect(inside.sim.sofiyka.keys).toBe(1);
    expect(outside.picked).toBe(false);
    expect(outside.sim.sofiyka.keys).toBe(0);
    inside.sim.dispose();
    outside.sim.dispose();
  });

  it('with the key from the source she opens the real cage; one use, the key is spent', async () => {
    const level: Level = { ...ARENA, cages: [{ id: 'c', position: { x: 0, y: 0, z: 10 }, facing: Math.PI, working: true }] };
    const sim = await createSim(level, CLOSE);
    walk(sim, { x: 0, y: 0, z: 1.3 });
    steps(sim, 2, { ...NO_INPUT, moveZ: 1e-3 });
    strikeOnce(sim);
    strikeOnce(sim);
    strikeOnce(sim);
    const key = sourceOf(sim).keyAt!;
    walk(sim, { x: 0, y: 0, z: key.z - 0.3 });
    steps(sim, 3);
    expect(sim.sofiyka.keys).toBe(1);
    const events = [...walk(sim, { x: 3, y: 0, z: 2 }), ...walk(sim, { x: 3, y: 0, z: 7.5 }), ...walk(sim, { x: 0, y: 0, z: 8.4 })];
    expect(events.filter((e) => e.type === 'cageOpened')).toEqual([{ type: 'cageOpened', id: 'c' }]);
    expect(sim.sofiyka.keys).toBe(0);
    sim.dispose();
  });
});

describe('a flower that opens only with a key', () => {
  const FLOWER: FlowerSpawn = { id: 'back', position: { x: 0, y: 0, z: 6 }, color: 'yellow', opens: true, opensWhen: 'keyHeld' };
  const NEAR: FlowerSpawn = { id: 'near', position: { x: 4, y: 0, z: 6 }, color: 'pink', opens: true };
  const LEVEL: Level = { blocks: [block(0, -0.5, 3, 10, 0.5, 9)], spawn: { x: 0, y: 0, z: 3 }, killY: -10, flowers: [FLOWER, NEAR] };
  const openness = (sim: Sim, id: string) => sim.flowers.find((f) => f.id === id)!.openness;

  it('stays a bud beside her without the key, opens with it; an ordinary flower opens either way', async () => {
    const without = await createSim(LEVEL);
    steps(without, 90);
    expect(openness(without, 'back')).toBe(0);
    expect(openness(without, 'near')).toBe(1);
    without.dispose();
    const withKey = await createSim(LEVEL, TUNING, { keys: 1 });
    steps(withKey, 90);
    expect(openness(withKey, 'back')).toBe(1);
    expect(openness(withKey, 'near')).toBe(1);
    withKey.dispose();
  });

  it('opens when the key comes into her hand, from the source, while she stands beside it', async () => {
    const level: Level = { ...LEVEL, source: { id: 'source', position: { x: 6, y: 0, z: 3 } }, flowers: [{ ...FLOWER, position: { x: 3, y: 0, z: 3 } }] };
    const sim = await createSim(level, CLOSE);
    walk(sim, { x: 6, y: 0, z: 3 - 2.7 });
    steps(sim, 2, { ...NO_INPUT, moveZ: 1e-3 });
    steps(sim, 60);
    expect(openness(sim, 'back')).toBe(0); // поруч, але без Ключа — бутон
    strikeOnce(sim);
    strikeOnce(sim);
    strikeOnce(sim);
    const key = sourceOf(sim).keyAt!;
    walk(sim, { x: key.x, y: 0, z: key.z - 0.3 });
    steps(sim, 3);
    expect(sim.sofiyka.keys).toBe(1);
    steps(sim, 60);
    expect(openness(sim, 'back')).toBeGreaterThan(0);
    sim.dispose();
  });
});

describe('Respawn and the source', () => {
  /** Іде вбік, за край (x = 8): падіння з одним Серцем — Відродження. */
  function fallOff(sim: Sim): SimEvent[] {
    const events: SimEvent[] = [];
    for (let i = 0; i < 600 && !events.some((e) => e.type === 'respawned'); i++) events.push(...sim.step({ ...NO_INPUT, moveX: 1 }));
    return events;
  }
  const breakIt = (sim: Sim) => {
    walk(sim, { x: 0, y: 0, z: 1.3 });
    steps(sim, 2, { ...NO_INPUT, moveZ: 1e-3 });
    strikeOnce(sim);
    strikeOnce(sim);
    strikeOnce(sim);
  };

  it('after keyPicked the key is still hers', async () => {
    const sim = await createSim(ARENA, CLOSE, { hearts: 1 });
    breakIt(sim);
    walk(sim, { x: 0, y: 0, z: sourceOf(sim).keyAt!.z - 0.3 });
    steps(sim, 3);
    expect(sim.sofiyka.keys).toBe(1);
    const events = fallOff(sim);
    expect(types(events)).toContain('respawned');
    expect(sim.sofiyka.keys).toBe(1);
    expect(sourceOf(sim)).toEqual({ hp: 0, broken: true, keyAt: null });
    sim.dispose();
  });

  it('after sourceBroken and before keyPicked the key lies where it did, and the source stays broken', async () => {
    const sim = await createSim(ARENA, CLOSE, { hearts: 1 });
    breakIt(sim);
    const before = sourceOf(sim).keyAt!;
    expect(sim.sofiyka.keys).toBe(0);
    const events = fallOff(sim);
    expect(types(events)).toContain('respawned');
    expect(sourceOf(sim).broken).toBe(true);
    expect(sourceOf(sim).keyAt).toEqual(before);
    expect(sim.sofiyka.keys).toBe(0);
    sim.dispose();
  });

  it('before sourceBroken the source is whole again with hp 3, and its cube is back in the world', async () => {
    const sim = await createSim(ARENA, CLOSE, { hearts: 1 });
    walk(sim, { x: 0, y: 0, z: 1.3 });
    steps(sim, 2, { ...NO_INPUT, moveZ: 1e-3 });
    strikeOnce(sim);
    strikeOnce(sim);
    expect(sourceOf(sim).hp).toBe(1);
    const events = fallOff(sim);
    expect(types(events)).toContain('respawned');
    expect(sourceOf(sim)).toEqual({ hp: 3, broken: false, keyAt: null });
    // Знову потрібні три Удари.
    walk(sim, { x: 0, y: 0, z: 1.3 });
    steps(sim, 2, { ...NO_INPUT, moveZ: 1e-3 });
    expect(strikeOnce(sim).filter((e) => e.type === 'sourceStruck')).toEqual([{ type: 'sourceStruck', hp: 2 }]);
    sim.dispose();
  });
});
