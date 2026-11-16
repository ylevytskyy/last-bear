import { describe, expect, it, vi } from 'vitest';
import { VILLAGE } from '../levels/village';
import { NO_INPUT } from './input';
import type { Block, Level, Vec3 } from './level';
import { createSim, createSimNow, initRules, type SimEvent } from './sim';
import { TUNING } from './tuning';
import { createWorldNow } from './world';

const real = VILLAGE.cages!.find((c) => c.working)!;
const block = (x: number, y: number, z: number, hx: number, hy: number, hz: number): Block => ({
  kind: 'solid',
  center: { x, y, z },
  halfExtents: { x: hx, y: hy, z: hz },
});
/** Дві платформи з прірвою між ними: стартова (x < 0) і дальня (x > 6). */
const ISLANDS: Level = {
  blocks: [block(-3, -0.5, 0, 3, 0.5, 5), block(12, -0.5, 0, 6, 0.5, 5)],
  spawn: { x: -1, y: 0, z: 0 },
  killY: -10,
};

describe('synchronous world creation', () => {
  it('two worlds made one after another step independently', async () => {
    await initRules();
    const a = createSimNow(VILLAGE);
    const b = createSimNow(VILLAGE);
    for (let i = 0; i < 30; i++) a.step({ ...NO_INPUT, moveX: 1 });
    expect(a.sofiyka.position.x).toBeGreaterThan(VILLAGE.spawn.x + 1);
    expect(b.sofiyka.position).toEqual(VILLAGE.spawn);
    b.step(NO_INPUT);
    expect(b.sofiyka.position.x).toBeCloseTo(VILLAGE.spawn.x, 4);
    expect(a.time).toBeCloseTo(0.5, 6);
    expect(b.time).toBeCloseTo(1 / 60, 9);
    a.dispose();
    b.dispose();
  });

  it('initRules is one promise however often it is called, and createSim still works', async () => {
    const first = initRules();
    expect(initRules()).toBe(first);
    await first;
    const sim = await createSim(VILLAGE);
    expect(sim.sofiyka.position).toEqual(VILLAGE.spawn);
    sim.dispose();
  });

  it('before initRules both createSimNow and createWorldNow fail with a message naming it', async () => {
    vi.resetModules();
    const sim = await import('./sim');
    const world = await import('./world');
    expect(() => sim.createSimNow(VILLAGE)).toThrow(/initRules/);
    expect(() => world.createWorldNow()).toThrow(/initRules/);
    await sim.initRules();
    const made = sim.createSimNow(VILLAGE);
    expect(made.sofiyka.position).toEqual(VILLAGE.spawn);
    made.dispose();
  });

  it('createWorldNow gives a world with the tuned gravity and step', async () => {
    await initRules();
    const { world } = createWorldNow();
    expect(world.gravity.y).toBe(-TUNING.gravity);
    expect(world.timestep).toBeCloseTo(TUNING.step, 6);
    world.free();
  });
});

describe('SimStart: open cages, hearts and spawn', () => {
  const walkInto = (sim: ReturnType<typeof createSimNow>, to: Vec3, max = 400): void => {
    for (let i = 0; i < max; i++) {
      const p = sim.sofiyka.position;
      const d = Math.hypot(to.x - p.x, to.z - p.z);
      if (d < 0.1) return;
      sim.step({ ...NO_INPUT, moveX: (to.x - p.x) / d, moveZ: (to.z - p.z) / d });
    }
  };
  const front: Vec3 = { x: real.position.x, y: 0, z: real.position.z - 3 };
  const inside: Vec3 = { x: real.position.x, y: 0, z: real.position.z };

  it('a cage open from the start has no door: she walks in; a closed one stops her at the door', async () => {
    await initRules();
    const closed = createSimNow(VILLAGE, TUNING, { spawn: front });
    walkInto(closed, inside);
    expect(closed.sofiyka.position.z).toBeLessThan(real.position.z - 1);
    closed.dispose();

    const open = createSimNow(VILLAGE, TUNING, { openCages: [real.id], spawn: front });
    walkInto(open, inside);
    expect(open.sofiyka.position.z).toBeGreaterThan(real.position.z - 0.2);
    expect(open.cages.find((c) => c.id === real.id)).toEqual({ id: real.id, open: true, working: true });
    expect(open.cages.filter((c) => c.open)).toHaveLength(1);
    open.dispose();
  });

  it('an open cage is not opened again: a key in hand is not spent on it and no cageOpened comes', async () => {
    await initRules();
    const sim = createSimNow(VILLAGE, TUNING, { keys: 1, openCages: [real.id], spawn: front });
    const events: SimEvent[] = [];
    for (let i = 0; i < 90; i++) events.push(...sim.step({ ...NO_INPUT, moveZ: 1 }));
    expect(events.some((e) => e.type === 'cageOpened')).toBe(false);
    expect(sim.sofiyka.keys).toBe(1);
    sim.dispose();
  });

  it('hearts at the start are what the start says, and the default is the tuned count', async () => {
    await initRules();
    const two = createSimNow(VILLAGE, TUNING, { hearts: 2 });
    expect(two.sofiyka.hearts).toBe(2);
    two.dispose();
    const full = createSimNow(VILLAGE);
    expect(full.sofiyka.hearts).toBe(TUNING.hearts);
    full.dispose();
  });

  it('spawn is where she stands and the checkpoint; a fall with the last heart respawns her there with full hearts', async () => {
    await initRules();
    const P: Vec3 = { x: 12, y: 0, z: 1 };
    const sim = createSimNow(ISLANDS, TUNING, { hearts: 1, spawn: P, keys: 1 });
    expect(sim.sofiyka.position).toEqual(P);
    expect(sim.checkpoint).toEqual(P);
    expect(sim.sofiyka.keys).toBe(1);
    // На краю дальньої платформи (x = 6) іде в прірву на захід: вона сходить на ліву платформу не доходячи — падає між ними.
    const events: SimEvent[] = [];
    for (let i = 0; i < 400 && !events.some((e) => e.type === 'respawned'); i++) events.push(...sim.step({ ...NO_INPUT, moveX: -1 }));
    expect(events.filter((e) => e.type === 'heartLost')).toEqual([{ type: 'heartLost', cause: 'fall' }]);
    expect(events.some((e) => e.type === 'respawned')).toBe(true);
    expect(sim.sofiyka.position.x).toBeCloseTo(P.x, 6);
    expect(sim.sofiyka.position.z).toBeCloseTo(P.z, 6);
    expect(sim.sofiyka.hearts).toBe(TUNING.hearts);
    expect(sim.sofiyka.keys).toBe(1);
    sim.dispose();
  });

  it('without a start spawn she stands at the level spawn and the checkpoint is the level spawn', async () => {
    await initRules();
    const sim = createSimNow(ISLANDS);
    expect(sim.sofiyka.position).toEqual(ISLANDS.spawn);
    expect(sim.checkpoint).toEqual(ISLANDS.spawn);
    sim.dispose();
  });
});

describe('the start exactly above the centre of the block she stands on', () => {
  const floor = (hx: number, hz: number): Block => block(0, -0.5, 0, hx, 0.5, hz);
  const cases: [string, Block[]][] = [
    ['one block 4 × 6.9 m', [floor(2, 3.4641)]],
    ['a hexagon of three nested blocks', [floor(3.5, 0.866), floor(3, 1.7321), floor(2, 3.4641)]],
    ['a hexagon with a strip 1 m deep', [floor(3.5, 0.5), floor(3, 1.7321), floor(2, 3.4641)]],
  ];
  const directions: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [name, blocks] of cases) {
    for (const [moveX, moveZ] of directions) {
      it(`${name}: a third of a second of walking (${moveX}, ${moveZ}) carries her 1.67 m and never under the floor`, async () => {
        const sim = await createSim({ blocks, spawn: { x: 0, y: 0, z: 0 }, killY: -10 });
        let lowest = Infinity;
        for (let i = 0; i < 20; i++) {
          sim.step({ ...NO_INPUT, moveX, moveZ });
          lowest = Math.min(lowest, sim.sofiyka.position.y);
        }
        const p = sim.sofiyka.position;
        // 20 кроків — це 1.67 м (з блока не сходить).
        expect(p.x * moveX + p.z * moveZ).toBeCloseTo(20 * TUNING.step * TUNING.walkSpeed, 2);
        expect(lowest).toBeGreaterThan(-0.001);
        expect(sim.sofiyka.grounded).toBe(true);
        sim.dispose();
      });
    }
  }
});

describe('walking on level ground keeps full speed in every direction', () => {
  /** Детермінований генератор (mulberry32). */
  function rng(seed: number): () => number {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const floor = (hx: number, hz: number): Block => block(0, -0.5, 0, hx, 0.5, hz);
  const STEPS = 15; // 1.25 м: зі старту в 0.5 м від центра вона лишається над блоками
  const grounds: [string, Block[]][] = [
    ['one block', [floor(3.5, 3.4641)]],
    ['a hexagon of three nested blocks', [floor(3.5, 0.866), floor(3, 1.7321), floor(2, 3.4641)]],
  ];
  for (const [name, blocks] of grounds) {
    it(`${name}: 60 random starts and directions, ${STEPS} steps each, not one step lost and never under the floor`, async () => {
      const r = rng(7);
      const lost: string[] = [];
      for (let k = 0; k < 60; k++) {
        // Кожен третій — рівно вздовж осі блока: там контролер губив кроки найчастіше.
        const angle = k % 3 === 0 ? (Math.floor(r() * 4) * Math.PI) / 2 : r() * Math.PI * 2;
        const from = k % 3 === 0 ? 0 : r() * 0.5;
        const turn = r() * Math.PI * 2;
        const spawn = { x: Math.cos(turn) * from, y: 0, z: Math.sin(turn) * from };
        const sim = await createSim({ blocks, spawn, killY: -10 });
        for (let i = 0; i < 30; i++) sim.step(NO_INPUT); // постояти, як гравець на старті
        const start = { ...sim.sofiyka.position };
        const moveX = Math.cos(angle);
        const moveZ = Math.sin(angle);
        let lowest = Infinity;
        for (let i = 0; i < STEPS; i++) {
          sim.step({ ...NO_INPUT, moveX, moveZ });
          lowest = Math.min(lowest, sim.sofiyka.position.y);
        }
        const p = sim.sofiyka.position;
        const steps = ((p.x - start.x) * moveX + (p.z - start.z) * moveZ) / (TUNING.step * TUNING.walkSpeed);
        if (steps < STEPS - 0.3 || lowest < -0.001) lost.push(`#${k}: ${steps.toFixed(1)} steps, lowest ${lowest.toFixed(4)}`);
        sim.dispose();
      }
      expect(lost).toEqual([]);
    });
  }
});

describe('being put in place does not lift her a little more each time', () => {
  const FLAT: Level = { blocks: [block(0, -0.5, 0, 60, 0.5, 60)], spawn: { x: -50, y: 0, z: 0.3 }, killY: -10 };

  it('eight Blinks in a row across level ground: her height after each is the same, within a tenth of a millimetre', async () => {
    const sim = await createSim(FLAT);
    const heights: number[] = [];
    for (let b = 0; b < 8; b++) {
      for (let i = 0; i < 130; i++) sim.step({ ...NO_INPUT, moveX: i < 20 ? 1 : 0 }); // пройтись і дочекатись перезарядки
      const events = sim.step({ ...NO_INPUT, blink: true });
      expect(events.map((e) => e.type)).toContain('blinked');
      sim.step(NO_INPUT);
      expect(sim.sofiyka.grounded).toBe(true);
      heights.push(sim.sofiyka.position.y);
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1e-4);
    expect(Math.max(...heights)).toBeLessThan(0.005);
    sim.dispose();
  });

  it('four falls and returns from the same edge: the place she is returned to stays at the same height', async () => {
    const sim = await createSim(ISLANDS);
    const heights: number[] = [];
    for (let fall = 0; fall < 4; fall++) {
      let back: Vec3 | null = null;
      for (let i = 0; i < 600 && !back; i++) {
        for (const e of sim.step({ ...NO_INPUT, moveX: 1 })) if (e.type === 'returned') back = e.to;
      }
      expect(back).not.toBeNull();
      heights.push(back!.y);
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1e-4);
    sim.dispose();
  });
});
