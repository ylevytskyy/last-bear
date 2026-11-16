import { describe, expect, it } from 'vitest';
import { VILLAGE } from '../levels/village';
import { NO_INPUT, type Input } from './input';
import type { Block, FlowerSpawn, Level, Vec3 } from './level';
import { createSim, type Sim, type SimEvent } from './sim';
import { TUNING, type Tuning } from './tuning';

const types = (events: SimEvent[]) => events.map((e) => e.type);
const FLOOR: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 30, y: 0.5, z: 30 } };
const YELLOW: FlowerSpawn = { id: 'yellow', position: { x: 0, y: 0, z: 5 }, color: 'yellow', opens: true };
const PINK: FlowerSpawn = { id: 'pink', position: { x: 8, y: 0, z: 5 }, color: 'pink', opens: false };
const LEVEL: Level = { blocks: [FLOOR], spawn: { x: 0, y: 0, z: -5 }, killY: -20, flowers: [YELLOW, PINK] };
const openness = (sim: Sim, id: string) => sim.flowers.find((f) => f.id === id)!.openness;
const JUMP: Input = { ...NO_INPUT, jump: true };
function steps(sim: Sim, n: number, input: Input = NO_INPUT): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...sim.step(input));
  return out;
}
/** Іде до точки по xz, доки не буде ближче за `stop`; збирає події. */
function walk(sim: Sim, target: Vec3, stop = 0.1): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < 1500; i++) {
    const p = sim.sofiyka.position;
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    if (d < stop) return events;
    events.push(...sim.step({ ...NO_INPUT, moveX: (target.x - p.x) / d, moveZ: (target.z - p.z) / d }));
  }
  throw new Error('never got there');
}
const beside = (f: FlowerSpawn, distance: number): Vec3 => ({ x: f.position.x, y: 0, z: f.position.z - distance });

describe('flowers open and close with her distance', () => {
  it('start closed; the yellow one opens within 6 m in 0.8 s and closes again when she leaves; the pink one never opens', async () => {
    const sim = await createSim(LEVEL);
    expect(sim.flowers.map((f) => f.id).sort()).toEqual(['pink', 'yellow']);
    steps(sim, 60); // 10 м від жовтої
    expect(openness(sim, 'yellow')).toBe(0);
    walk(sim, beside(YELLOW, 5.5));
    const near = openness(sim, 'yellow');
    steps(sim, 12);
    expect(openness(sim, 'yellow')).toBeGreaterThan(near);
    steps(sim, 45);
    expect(openness(sim, 'yellow')).toBe(1);
    walk(sim, beside(YELLOW, 7));
    steps(sim, 50);
    expect(openness(sim, 'yellow')).toBe(0);
    expect(openness(sim, 'pink')).toBe(0);
    sim.dispose();
  });

  it('a flower that does not open stays at 0 with her right beside it', async () => {
    const sim = await createSim(LEVEL);
    walk(sim, beside(PINK, 1.5));
    steps(sim, 120);
    expect(openness(sim, 'pink')).toBe(0);
    sim.dispose();
  });
});

describe('a jump into the bud', () => {
  it('standing 0.8 m from an open flower and jumping on the spot fires one flowerEntered and puts her on the checkpoint; the flower stays open', async () => {
    const sim = await createSim(LEVEL);
    walk(sim, beside(YELLOW, 0.8));
    steps(sim, 60);
    expect(openness(sim, 'yellow')).toBe(1);
    sim.step(JUMP);
    const events: SimEvent[] = [];
    let at = -1;
    for (let i = 0; i < 120 && at < 0; i++) {
      const out = sim.step(JUMP); // пробіл тримається: стрибок повної висоти
      events.push(...out);
      if (types(out).includes('flowerEntered')) at = i;
    }
    expect(at).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === 'flowerEntered')).toEqual([{ type: 'flowerEntered', id: 'yellow' }]);
    expect(sim.sofiyka.position).toEqual(LEVEL.spawn);
    expect(sim.sofiyka.grounded).toBe(true);
    expect(openness(sim, 'yellow')).toBe(1);
    expect(types(steps(sim, 120))).not.toContain('flowerEntered');
    sim.dispose();
  });

  it('works in the village too: she follows the flower trail, waits for the bud to open and jumps in', async () => {
    // Жовта Квітка Селища тепер веде в інший світ (`to`), а тут перевіряється поведінка без `to`: на Контрольну точку.
    const local: Level = { ...VILLAGE, flowers: VILLAGE.flowers!.map(({ to: _to, ...f }) => f) };
    const sim = await createSim(local);
    const yellow = VILLAGE.flowers!.find((f) => f.opens)!;
    const events: SimEvent[] = [];
    for (const p of VILLAGE.trail!.flower) events.push(...walk(sim, p, 0.3));
    events.push(...walk(sim, { x: yellow.position.x - 0.8, y: 0, z: yellow.position.z }));
    steps(sim, 60);
    expect(openness(sim, yellow.id)).toBe(1);
    events.push(...sim.step(JUMP), ...steps(sim, 90, JUMP));
    expect(events.filter((e) => e.type === 'flowerEntered')).toEqual([{ type: 'flowerEntered', id: yellow.id }]);
    expect(Math.hypot(sim.sofiyka.position.x - sim.checkpoint.x, sim.sofiyka.position.z - sim.checkpoint.z)).toBeLessThan(0.01);
    sim.dispose();
  });

  it('jumping beside a closed bud fires nothing', async () => {
    const sim = await createSim(LEVEL);
    walk(sim, beside(PINK, 0.8));
    const events = [...sim.step(JUMP), ...steps(sim, 90, JUMP)];
    expect(sim.sofiyka.position.z).toBeGreaterThan(PINK.position.z - 1.2);
    expect(types(events)).toContain('landed');
    expect(types(events)).not.toContain('flowerEntered');
    sim.dispose();
  });

  it('standing on the stem and stepping off is not entering the flower', async () => {
    // Невисокий стрибок (нижчий за бутон): зійти на ніжку можна, не перетнувши висоти бутона згори вниз.
    const low: Tuning = { ...TUNING, jumpHeight: 0.9 };
    const sim = await createSim(LEVEL, low);
    walk(sim, beside(YELLOW, 1.1));
    steps(sim, 60);
    expect(openness(sim, 'yellow')).toBe(1);
    const events = [...sim.step({ ...JUMP, moveZ: 1 }), ...steps(sim, 9, { ...JUMP, moveZ: 1 }), ...steps(sim, 40, JUMP)];
    expect(sim.sofiyka.position.y).toBeCloseTo(TUNING.village.flowerStemTop, 1);
    expect(sim.sofiyka.grounded).toBe(true);
    events.push(...steps(sim, 20)); // стоїть на ніжці
    events.push(...steps(sim, 60, { ...NO_INPUT, moveZ: -1 })); // сходить назад
    expect(sim.sofiyka.position.y).toBeCloseTo(0, 1);
    expect(types(events)).not.toContain('flowerEntered');
    sim.dispose();
  });
});

describe('review fixes: entering a flower', () => {
  it('closes an open Window and leaves no slowdown behind', async () => {
    const turtle = { id: 't', kind: 'turtle' as const, position: { x: 0, y: 0, z: 2 }, facing: 0 };
    const tuning: Tuning = { ...TUNING, slowdownSeconds: 60, turtle: { ...TUNING.turtle, windupSeconds: 5 } };
    const sim = await createSim({ ...LEVEL, enemies: [turtle] }, tuning);
    walk(sim, beside(YELLOW, 0.8));
    for (let i = 0; i < 400 && !sim.slowdown.open; i++) sim.step(NO_INPUT);
    expect(sim.slowdown.open).toBe(true);
    for (let i = 0; i < 120 && openness(sim, 'yellow') < 1; i++) sim.step(NO_INPUT);
    const events = [...sim.step(JUMP)];
    for (let i = 0; i < 120 && !types(events).includes('flowerEntered'); i++) events.push(...sim.step(JUMP));
    expect(types(events)).toContain('flowerEntered');
    expect(events).toContainEqual({ type: 'windowClosed', reflexed: false });
    expect(sim.slowdown.open).toBe(false);
    expect(sim.timeScale).toBe(1);
    sim.dispose();
  });

  it('lands on the checkpoint in front of an opened cage, not on the level start', async () => {
    const cage = { id: 'c', position: { x: 6, y: 0, z: 0 }, facing: -Math.PI / 2, working: true };
    const sim = await createSim({ ...LEVEL, cages: [cage] }, TUNING, { keys: 1 });
    const opened = walk(sim, { x: 4.5, y: 0, z: 0 });
    expect(types(opened)).toContain('cageOpened');
    const checkpoint = { ...sim.checkpoint };
    expect(checkpoint.x).toBeCloseTo(6 - TUNING.village.cageCheckpointDistance, 6);
    walk(sim, beside(YELLOW, 0.8));
    for (let i = 0; i < 120 && openness(sim, 'yellow') < 1; i++) sim.step(NO_INPUT);
    const events = [...sim.step(JUMP)];
    for (let i = 0; i < 120 && !types(events).includes('flowerEntered'); i++) events.push(...sim.step(JUMP));
    expect(types(events)).toContain('flowerEntered');
    expect(sim.sofiyka.position.x).toBeCloseTo(checkpoint.x, 2);
    expect(sim.sofiyka.position.z).toBeCloseTo(checkpoint.z, 2);
    sim.dispose();
  });
});

describe('review fixes: a cage corner', () => {
  it('opens by the true distance to the corner, not the larger of the two gaps', async () => {
    const cage = { id: 'c', position: { x: 6, y: 0, z: 0 }, facing: -Math.PI / 2, working: true };
    const far = await createSim({ ...LEVEL, cages: [cage] }, TUNING, { keys: 1 });
    // Кут Клітки (5, −1); по 0.7 м від нього по x і z — справжня відстань 0.99 > 0.8.
    expect(types(walk(far, { x: 4.3, y: 0, z: -1.7 }, 0.03))).not.toContain('cageOpened');
    far.dispose();
    const near = await createSim({ ...LEVEL, cages: [cage] }, TUNING, { keys: 1 });
    expect(types(walk(near, { x: 4.5, y: 0, z: -1.5 }, 0.03))).toContain('cageOpened'); // 0.71 ≤ 0.8
    near.dispose();
  });
});
