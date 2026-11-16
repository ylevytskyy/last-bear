import { describe, expect, it } from 'vitest';
import { VILLAGE } from '../levels/village';
import { NO_INPUT, type Input } from './input';
import type { Block, EnemySpawn, Level, Vec3 } from './level';
import { createSim, type Sim, type SimEvent } from './sim';
import { TUNING, type Tuning } from './tuning';
import { levelBlocks } from './village-geometry';

const types = (events: SimEvent[]) => events.map((e) => e.type);
const real = VILLAGE.cages!.find((c) => c.working)!;
const decorative = VILLAGE.cages!.find((c) => !c.working)!;
const NO_ENEMIES: Level = { ...VILLAGE, enemies: [] };

function steps(sim: Sim, n: number, input: Input = NO_INPUT): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...sim.step(input));
  return out;
}
/** Іде по точках (xz) не довше 600 кроків на точку (стіна може не пустити); збирає події. */
function walk(sim: Sim, path: Vec3[]): SimEvent[] {
  const events: SimEvent[] = [];
  for (const target of path) {
    for (let i = 0; i < 600; i++) {
      const p = sim.sofiyka.position;
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15) break;
      events.push(...sim.step({ ...NO_INPUT, moveX: dx / d, moveZ: dz / d }));
    }
  }
  return events;
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
const inFront = (cage: { position: Vec3; facing: number }, distance: number): Vec3 => ({
  x: cage.position.x + Math.sin(cage.facing) * distance,
  y: cage.position.y,
  z: cage.position.z + Math.cos(cage.facing) * distance,
});
const frontOfReal = (d: number) => inFront(real, 1 + d);

describe('keys, cages and the checkpoint', () => {
  it('without keys the starting state is no key, closed cages, the checkpoint at the spawn', async () => {
    const sim = await createSim(VILLAGE);
    expect(sim.sofiyka.keys).toBe(0);
    expect(sim.cages).toHaveLength(5);
    expect(sim.cages.every((c) => !c.open)).toBe(true);
    expect(sim.cages.filter((c) => c.working).map((c) => c.id)).toEqual([real.id]);
    expect(sim.checkpoint).toEqual(VILLAGE.spawn);
    sim.dispose();
    const keyed = await createSim(VILLAGE, TUNING, { keys: 3 });
    expect(keyed.sofiyka.keys).toBe(3);
    keyed.dispose();
  });

  it('with a key she opens the real cage by walking up to its door: the key is spent, the checkpoint is in front of the door and clear', async () => {
    const sim = await createSim(VILLAGE, TUNING, { keys: 1 });
    const events = walk(sim, [frontOfReal(2.5), inFront(real, 1)]);
    expect(events.filter((e) => e.type === 'cageOpened')).toEqual([{ type: 'cageOpened', id: real.id }]);
    expect(sim.sofiyka.keys).toBe(0);
    expect(sim.cages.find((c) => c.id === real.id)).toEqual({ id: real.id, open: true, working: true });
    expect(sim.cages.filter((c) => c.open)).toHaveLength(1);
    const want = inFront(real, TUNING.village.cageCheckpointDistance);
    expect(sim.checkpoint.x).toBeCloseTo(want.x, 9);
    expect(sim.checkpoint.z).toBeCloseTo(want.z, 9);
    expect(sim.checkpoint.y).toBeCloseTo(want.y, 9);
    for (const b of levelBlocks(VILLAGE, new Set([real.id]), TUNING)) if (b.center.y > 0) expect(clearance(sim.checkpoint, b)).toBeGreaterThan(0.05); // не рахуючи підлоги
    sim.dispose();
  });

  it('it opens just as well when she comes at its side wall at 45 degrees', async () => {
    const sim = await createSim(VILLAGE, TUNING, { keys: 1 });
    // Входить у проміжок між Клітками з півдня й іде на північний захід до бічної стінки.
    const gap = { x: real.position.x + 2, y: 0, z: real.position.z - 3 };
    const before = walk(sim, [gap]);
    expect(types(before)).not.toContain('cageOpened');
    const events: SimEvent[] = [];
    for (let i = 0; i < 200 && !types(events).includes('cageOpened'); i++) events.push(...sim.step({ ...NO_INPUT, moveX: -1, moveZ: 1 }));
    expect(events.filter((e) => e.type === 'cageOpened')).toEqual([{ type: 'cageOpened', id: real.id }]);
    expect(sim.sofiyka.keys).toBe(0);
    expect(sim.cages.find((c) => c.id === real.id)!.open).toBe(true);
    sim.dispose();
  });

  it('without a key the real cage stays shut however long she stands at its door', async () => {
    const sim = await createSim(NO_ENEMIES, TUNING, { keys: 0 });
    const events = [...walk(sim, [frontOfReal(2.5), inFront(real, 1)]), ...steps(sim, 120, { ...NO_INPUT, moveZ: 1 })];
    expect(types(events)).not.toContain('cageOpened');
    expect(sim.cages.every((c) => !c.open)).toBe(true);
    expect(sim.sofiyka.position.z).toBeLessThan(real.position.z - 1); // двері на місці
    sim.dispose();
  });

  it('a decorative cage never opens and does not take the key', async () => {
    const sim = await createSim(NO_ENEMIES, TUNING, { keys: 1 });
    const events = [...walk(sim, [inFront(decorative, 3.5), inFront(decorative, 1)]), ...steps(sim, 120, { ...NO_INPUT, moveZ: 1 })];
    expect(types(events)).not.toContain('cageOpened');
    expect(sim.sofiyka.keys).toBe(1);
    expect(sim.cages.every((c) => !c.open)).toBe(true);
    sim.dispose();
  });

  it('with two keys the first cage costs one and the second visit finds the cage already open', async () => {
    const sim = await createSim(VILLAGE, TUNING, { keys: 2 });
    walk(sim, [frontOfReal(2.5), inFront(real, 1)]);
    expect(sim.sofiyka.keys).toBe(1);
    const again = [...walk(sim, [frontOfReal(2.5)]), ...walk(sim, [inFront(real, 1)])];
    expect(types(again)).not.toContain('cageOpened');
    expect(sim.sofiyka.keys).toBe(1);
    sim.dispose();
  });

  it('once the cage is open she can walk in through where the door was', async () => {
    const sim = await createSim(VILLAGE, TUNING, { keys: 1 });
    walk(sim, [frontOfReal(2.5), inFront(real, 1)]);
    expect(sim.cages.find((c) => c.id === real.id)!.open).toBe(true);
    steps(sim, 90, { ...NO_INPUT, moveZ: 1 });
    const p = sim.sofiyka.position;
    expect(Math.abs(p.x - real.position.x)).toBeLessThan(0.5);
    expect(p.z).toBeGreaterThan(real.position.z - 0.6); // за площиною дверей (z центру − 1) і поглибше
    expect(p.z).toBeLessThan(real.position.z + 1);
    sim.dispose();
  });
});

describe('a cage whose door looks east', () => {
  it('opens from the east and puts the checkpoint on the east side, clear of the walls', async () => {
    const cage = { id: 'e', position: { x: 0, y: 0, z: 0 }, facing: Math.PI / 2, working: true };
    const floor: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 10, y: 0.5, z: 10 } };
    const level: Level = { blocks: [floor], spawn: { x: 6, y: 0, z: 0 }, killY: -10, cages: [cage] };
    const sim = await createSim(level, TUNING, { keys: 1 });
    const events = walk(sim, [{ x: 1.2, y: 0, z: 0 }]);
    expect(events).toContainEqual({ type: 'cageOpened', id: 'e' });
    expect(sim.checkpoint.x).toBeCloseTo(TUNING.village.cageCheckpointDistance, 9);
    expect(sim.checkpoint.z).toBeCloseTo(0, 9);
    steps(sim, 90, { ...NO_INPUT, moveX: -1 });
    expect(Math.abs(sim.sofiyka.position.x)).toBeLessThan(0.6); // зайшла крізь місце дверей
    sim.dispose();
  });
});

describe('respawn with an open cage', () => {
  /** Бджола зліва від Софійки, коли вона підійшла до Клітки: сплячка лишається в її досягу, і її б'ють по колу. */
  const bee = (x: number, y: number, z: number, aggro: number): [EnemySpawn, Tuning] => [
    { id: 'b1', kind: 'bee', position: { x, y, z }, facing: Math.PI },
    { ...TUNING, knockbackDistance: 0, bee: { ...TUNING.bee, aggroRadius: aggro } },
  ];
  /** Іде за `path`, поки не відкриється Клітка, і далі стоїть, доки не буде Відродження. */
  async function untilRespawn(level: Level, tuning: Tuning, path: Vec3[], keys: number) {
    const sim = await createSim(level, tuning, { keys });
    const events: SimEvent[] = [];
    for (const target of path) {
      for (let i = 0; i < 1500 && !types(events).includes('cageOpened'); i++) {
        const p = sim.sofiyka.position;
        const d = Math.hypot(target.x - p.x, target.z - p.z);
        if (d < 0.15) break;
        events.push(...sim.step({ ...NO_INPUT, moveX: (target.x - p.x) / d, moveZ: (target.z - p.z) / d }));
      }
    }
    expect(types(events)).toContain('cageOpened');
    let respawned = false;
    for (let i = 0; i < 6000 && !respawned; i++) {
      const out = sim.step(NO_INPUT);
      events.push(...out);
      respawned = types(out).includes('respawned');
    }
    expect(respawned).toBe(true);
    return { sim, events };
  }

  it('losing the last heart puts her on the cage checkpoint with five hearts; the key count and the open cage stay', async () => {
    const [b, tuning] = bee(8, 1.5, 14, 8.5);
    const level: Level = { ...VILLAGE, spawn: { x: 0, y: 0, z: 8 }, enemies: [b] };
    const { sim } = await untilRespawn(level, tuning, [inFront(real, 1)], 2);
    const want = inFront(real, TUNING.village.cageCheckpointDistance);
    expect(sim.sofiyka.hearts).toBe(5);
    expect(sim.sofiyka.position.x).toBeCloseTo(want.x, 2);
    expect(sim.sofiyka.position.z).toBeCloseTo(want.z, 2);
    expect(sim.sofiyka.keys).toBe(1);
    expect(sim.cages.find((c) => c.id === real.id)!.open).toBe(true);
    expect(sim.enemies[0]!.state).toBe('HOVER'); // вороги скинуті
    sim.dispose();
  });

  it('a respawn before any cage is open still goes to the spawn', async () => {
    const [b, tuning] = bee(0, 1.5, 6, 9);
    const level: Level = { ...NO_ENEMIES, spawn: { x: 0, y: 0, z: 0 }, enemies: [b] };
    const sim = await createSim(level, tuning);
    const events = steps(sim, 4000);
    expect(types(events)).toContain('respawned');
    expect(sim.checkpoint).toEqual({ x: 0, y: 0, z: 0 });
    sim.dispose();
  });

  it('falling off an edge after the respawn returns her to the cage checkpoint, not to the level spawn', async () => {
    // Майданчик закінчується за 0.3 м позаду Контрольної точки: вона не «надійне місце», тож повернути можна лише на неї.
    const cage = { id: 'c', position: { x: 0, y: 0, z: 0 }, facing: Math.PI, working: true };
    const edge = -(TUNING.village.cageCheckpointDistance + 0.3);
    const floor: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: (edge + 8) / 2 }, halfExtents: { x: 8, y: 0.5, z: (8 - edge) / 2 } };
    const [b, tuning] = bee(4, 1.5, -2, 6.2);
    const level: Level = { blocks: [floor], spawn: { x: -5, y: 0, z: 3 }, killY: -10, enemies: [b], cages: [cage] };
    const { sim } = await untilRespawn(level, tuning, [{ x: -5, y: 0, z: -1.4 }, { x: -1.4, y: 0, z: -1.4 }], 1);
    const checkpoint = sim.checkpoint;
    expect(sim.sofiyka.position.z).toBeCloseTo(checkpoint.z, 2);
    let returned: SimEvent | undefined;
    let lost = false;
    for (let i = 0; i < 240 && !returned; i++) {
      const out = sim.step({ ...NO_INPUT, moveZ: -1 });
      lost ||= out.some((e) => e.type === 'heartLost' && e.cause === 'fall');
      returned = out.find((e) => e.type === 'returned');
    }
    expect(lost).toBe(true);
    expect(returned).toEqual({ type: 'returned', to: checkpoint });
    expect(returned).not.toEqual({ type: 'returned', to: level.spawn });
    sim.dispose();
  });
});
