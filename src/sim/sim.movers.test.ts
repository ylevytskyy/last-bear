import { describe, expect, it } from 'vitest';
import { NO_INPUT } from './input';
import type { Block, Level, MoverSpawn, Vec3 } from './level';
import { moverPosition } from './movers';
import { createSim, type Sim, type SimEvent } from './sim';
import { TUNING } from './tuning';
import { levelBlocks } from './village-geometry';

const block = (x: number, y: number, z: number, hx: number, hy: number, hz: number): Block => ({
  kind: 'solid',
  center: { x, y, z },
  halfExtents: { x: hx, y: hy, z: hz },
});
const V = TUNING.movers.speed;
/** Платформа 3×3 м, верх на y = 0, ходить по x від 2 до 8 над порожнечею. */
const RIDE: MoverSpawn = { id: 'ride', block: block(2, -0.25, 0, 1.5, 0.25, 1.5), to: { x: 8, y: -0.25, z: 0 } };
const OVER_VOID: Level = { blocks: [], spawn: { x: 2, y: 0, z: 0 }, killY: -10, movers: [RIDE] };
const mover = (sim: Sim, id: string) => sim.movers.find((m) => m.id === id)!.position;
function steps(sim: Sim, n: number, input = NO_INPUT): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...sim.step(input));
  return out;
}
/** Відстань від вертикального відрізка капсули до коробки, мінус радіус. */
function clearance(soles: Vec3, b: Block): number {
  const r = TUNING.capsuleRadius;
  const gap = (lo: number, hi: number, c: number, h: number) => Math.max(0, c - h - hi, lo - (c + h));
  const dx = gap(soles.x, soles.x, b.center.x, b.halfExtents.x);
  const dz = gap(soles.z, soles.z, b.center.z, b.halfExtents.z);
  const dy = gap(soles.y + r, soles.y + TUNING.capsuleHeight - r, b.center.y, b.halfExtents.y);
  return Math.hypot(dx, dy, dz) - r;
}

describe('movers are part of the world', () => {
  it('Sim.movers follows moverPosition with the game time, from A at time 0', async () => {
    const sim = await createSim(OVER_VOID);
    expect(mover(sim, 'ride')).toEqual(RIDE.block.center);
    for (const n of [1, 30, 120, 240, 400]) {
      steps(sim, n - (sim.time * 60 + 0.5 | 0));
      const want = moverPosition(RIDE.block.center, RIDE.to, sim.time, V);
      const got = mover(sim, 'ride');
      expect(got.x).toBeCloseTo(want.x, 4);
      expect(got.y).toBeCloseTo(want.y, 4);
      expect(got.z).toBeCloseTo(want.z, 4);
    }
    sim.dispose();
  });

  it('levelBlocks holds the platform at point A, and the world has the platform only where it is now, not also at A', async () => {
    expect(levelBlocks(OVER_VOID, new Set(), TUNING)).toContainEqual(RIDE.block);
    const sim = await createSim({ ...OVER_VOID, spawn: { x: 40, y: 0, z: 0 }, blocks: [block(40, -0.5, 0, 5, 0.5, 5)] });
    const above = (x: number) => sim.rayDistance({ x, y: 3, z: 0 }, { x: 0, y: -1, z: 0 }, 20);
    expect(above(2)).toBeCloseTo(3, 2); // платформа в A, верх на 0
    steps(sim, 60 * 5); // 5 с · 1.5 = 7.5 м: вона вже в B
    expect(above(8)).toBeCloseTo(3, 1);
    expect(above(2)).toBe(20); // у A нічого не лишилось
    sim.dispose();
  });
});

describe('Sofiyka on a moving platform', () => {
  it('rides it for 2 s without input: the distance to its centre changes by less than 0.05 m and she does not fall', async () => {
    const sim = await createSim(OVER_VOID);
    steps(sim, 2); // осідає
    const rel = () => ({ x: sim.sofiyka.position.x - mover(sim, 'ride').x, z: sim.sofiyka.position.z - mover(sim, 'ride').z });
    const start = rel();
    const x0 = sim.sofiyka.position.x;
    const events = steps(sim, 120);
    const end = rel();
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(0.05);
    expect(sim.sofiyka.position.x - x0).toBeGreaterThan(2.5); // справді поїхала: 2 с · 1.5 м/с = 3 м
    expect(sim.sofiyka.position.y).toBeCloseTo(0, 1);
    expect(sim.sofiyka.grounded).toBe(true);
    expect(events.filter((e) => e.type === 'heartLost' || e.type === 'returned')).toEqual([]);
    sim.dispose();
  });

  it('keeps riding the whole way there and back, a full period, without falling', async () => {
    const sim = await createSim(OVER_VOID);
    const events = steps(sim, 60 * 9); // туди (4 с) і назад (4 с) і трохи
    expect(events.filter((e) => e.type === 'heartLost')).toEqual([]);
    expect(sim.sofiyka.position.y).toBeCloseTo(0, 1);
    sim.dispose();
  });

  it('is stopped by a wall in the platform path and her capsule is never inside it', async () => {
    const wall = block(8, 3, 0, 0.25, 3, 5); // грань x = 7.75
    const level: Level = { ...OVER_VOID, blocks: [wall], movers: [{ ...RIDE, to: { x: 8.3, y: -0.25, z: 0 } }] };
    const sim = await createSim(level);
    let maxX = -Infinity;
    for (let i = 0; i < 60 * 8; i++) {
      sim.step(NO_INPUT);
      maxX = Math.max(maxX, sim.sofiyka.position.x);
      expect(clearance(sim.sofiyka.position, wall), `step ${i}`).toBeGreaterThanOrEqual(-0.005);
    }
    expect(maxX).toBeGreaterThan(7.2); // справді дійшла до стіни
    expect(maxX).toBeLessThanOrEqual(7.75 - TUNING.capsuleRadius + 0.005);
    sim.dispose();
  });

  it('after a fall from a moving platform she is put back on the last still, safe ground, not on the platform', async () => {
    const level: Level = {
      blocks: [block(-3, -0.5, 0, 3, 0.5, 3)], // нерухома: x від −6 до 0
      spawn: { x: -0.9, y: 0, z: 0 },
      killY: -10,
      movers: [{ id: 'ride', block: block(1.7, -0.25, 0, 1.5, 0.25, 1.5), to: { x: 9.7, y: -0.25, z: 0 } }],
    };
    const sim = await createSim(level);
    const events: SimEvent[] = [];
    for (let i = 0; i < 30; i++) events.push(...sim.step({ ...NO_INPUT, moveX: 1 })); // сходить на платформу
    expect(sim.sofiyka.position.x).toBeGreaterThan(0.5);
    expect(sim.sofiyka.grounded).toBe(true);
    events.push(...steps(sim, 60 * 3)); // їде
    expect(sim.sofiyka.position.x).toBeGreaterThan(4); // далеко від нерухомої землі
    expect(events.filter((e) => e.type === 'heartLost')).toEqual([]);
    for (let i = 0; i < 600 && !events.some((e) => e.type === 'returned'); i++) events.push(...sim.step({ ...NO_INPUT, moveZ: 1 })); // іде з неї вбік
    expect(events.filter((e) => e.type === 'heartLost')).toEqual([{ type: 'heartLost', cause: 'fall' }]);
    const back = events.find((e) => e.type === 'returned');
    expect(back).toBeDefined();
    if (back?.type !== 'returned') throw new Error('unreachable');
    expect(back.to.x).toBeLessThanOrEqual(-0.5 + 0.01); // нерухома платформа, з відступом від краю
    expect(back.to.x).toBeGreaterThan(-6);
    expect(back.to.y).toBeCloseTo(0, 2);
    expect(sim.sofiyka.position.x).toBeLessThan(0);
    sim.dispose();
  });
});
