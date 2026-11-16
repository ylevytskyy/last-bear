import { describe, expect, it } from 'vitest';
import { BACKROOMS } from '../levels/backrooms';
import { VILLAGE } from '../levels/village';
import { NO_INPUT } from './input';
import type { Block, Level } from './level';
import { walkRoute } from './route';
import { createSim, type Sim, type SimEvent } from './sim';
import { TUNING } from './tuning';
import { levelBlocks } from './village-geometry';

const types = (events: SimEvent[]) => events.map((e) => e.type);
const MAX = 1800; // 30 с
const route = BACKROOMS.route!;
const BLOCKS = levelBlocks(BACKROOMS, new Set(), TUNING);
const bars = BLOCKS.filter((b) => b.kind === 'bars');
const solids = BLOCKS.filter((b) => b.kind === 'solid');
const flower = BACKROOMS.flowers![0]!;
/** Усе, що не підлога й не стіни кімнати: сходинка й уступ — суцільні блоки нижчі за стіни. */
const lowBlocks = solids.filter((b) => b.center.y + b.halfExtents.y < 3 && b.center.y - b.halfExtents.y >= 0);
const top = (b: Block) => b.center.y + b.halfExtents.y;

/** Записує підошви після кожного кроку. */
function recorded(sim: Sim): { x: number; y: number; z: number }[] {
  const trace: { x: number; y: number; z: number }[] = [];
  const step = sim.step.bind(sim);
  sim.step = (input) => {
    const out = step(input);
    trace.push({ ...sim.sofiyka.position });
    return out;
  };
  return trace;
}

describe('BACKROOMS as a level', () => {
  it('is a yellow room of about 16 by 30 m (6 m of it behind the start for the camera) with 4 m walls, one flower to the village, an intro, and a trail to the flower', () => {
    const floor = BACKROOMS.blocks.find((b) => top(b) === 0 && b.halfExtents.x >= 7.5)!;
    expect(floor.halfExtents.x * 2).toBeGreaterThanOrEqual(15.9);
    expect(floor.halfExtents.x * 2).toBeLessThanOrEqual(16.5);
    expect(floor.halfExtents.z * 2).toBeGreaterThanOrEqual(23.9);
    expect(floor.halfExtents.z * 2).toBeLessThanOrEqual(30.5);
    const walls = BACKROOMS.blocks.filter((b) => b.center.y - b.halfExtents.y < 0.01 && top(b) >= 4 - 1e-9 && b.kind === 'solid');
    expect(walls.length).toBeGreaterThanOrEqual(4);
    expect(BACKROOMS.flowers).toHaveLength(1);
    expect(flower.to).toBe('village');
    expect(flower.opens).toBe(true);
    expect(BACKROOMS.intro).toBe(true);
    expect(BACKROOMS.trail!.cage).toEqual([]);
    const end = BACKROOMS.trail!.flower[BACKROOMS.trail!.flower.length - 1]!;
    expect(Math.hypot(end.x - flower.position.x, end.z - flower.position.z)).toBeGreaterThan(TUNING.village.flowerEnterRadius);
    expect(Math.hypot(end.x - flower.position.x, end.z - flower.position.z)).toBeLessThan(2);
    const start = BACKROOMS.trail!.flower[0]!;
    expect(Math.hypot(start.x - BACKROOMS.spawn.x, start.z - BACKROOMS.spawn.z)).toBeLessThan(2);
    expect(BACKROOMS.enemies ?? []).toEqual([]);
  });

  it('has a low step she can jump onto, a ledge between one jump and two, and bars higher than two jumps', () => {
    const jump = TUNING.jumpHeight;
    const both = TUNING.jumpHeight + TUNING.doubleJumpHeight;
    const tops = lowBlocks.map(top).sort((a, b) => a - b);
    expect(tops.some((t) => t > 0.3 && t < jump - 0.2)).toBe(true); // сходинка
    expect(tops.some((t) => t > jump + 0.2 && t < both - 0.3)).toBe(true); // уступ
    expect(bars.length).toBeGreaterThan(0);
    for (const b of bars) expect(top(b)).toBeGreaterThanOrEqual(3.2 - 1e-9);
    expect(3.2).toBeGreaterThan(both);
  });

  it('has the four signs the plan asks for: arrows at the start, a space, a double space, a shift', () => {
    const signs = BACKROOMS.signs!;
    expect(signs.map((s) => s.keys[0]).sort()).toEqual(['arrows', 'shift', 'space', 'space2']);
    const at = (k: string) => signs.find((s) => s.keys.includes(k as 'arrows'))!;
    expect(Math.hypot(at('arrows').position.x - BACKROOMS.spawn.x, at('arrows').position.z - BACKROOMS.spawn.z)).toBeLessThan(4);
    // Кожна табличка стоїть на землі перед своєю перешкодою (менше за 4 м до неї по z) і збоку від проходу.
    const firstLow = lowBlocks.map((b) => b.center.z - b.halfExtents.z).sort((a, b) => a - b);
    const stepZ = firstLow[0]!;
    const ledgeZ = lowBlocks.find((b) => top(b) > TUNING.jumpHeight)!.center.z - lowBlocks.find((b) => top(b) > TUNING.jumpHeight)!.halfExtents.z;
    const barsZ = bars[0]!.center.z;
    expect(stepZ - at('space').position.z).toBeGreaterThan(0);
    expect(stepZ - at('space').position.z).toBeLessThan(4);
    expect(ledgeZ - at('space2').position.z).toBeGreaterThan(0);
    expect(ledgeZ - at('space2').position.z).toBeLessThan(4);
    expect(barsZ - at('shift').position.z).toBeGreaterThan(0);
    expect(barsZ - at('shift').position.z).toBeLessThan(4);
    for (const s of signs) expect(s.position.y).toBe(0);
  });
});

describe('walking the route of BACKROOMS', () => {
  it('with every action the bot reaches the end of the route and jumps into the flower within 1800 steps, at full hearts', async () => {
    const sim = await createSim(BACKROOMS);
    const run = walkRoute(sim, route, MAX, { level: BACKROOMS });
    expect(run.reached).toBe(route.points.length - 1);
    expect(run.steps).toBeLessThanOrEqual(MAX);
    expect(run.events.filter((e) => e.type === 'flowerEntered')).toEqual([{ type: 'flowerEntered', id: flower.id }]);
    expect(types(run.events)).toContain('blinked');
    expect(run.events.filter((e) => e.type === 'jumped' && e.double)).toHaveLength(1);
    expect(sim.sofiyka.hearts).toBe(TUNING.hearts);
    expect(types(run.events)).not.toContain('returned');
    sim.dispose();
  });

  it('the route starts at the spawn and ends in front of the flower; its actions name real points', () => {
    expect(Math.hypot(route.points[0]!.x - BACKROOMS.spawn.x, route.points[0]!.z - BACKROOMS.spawn.z)).toBeLessThan(0.4);
    const last = route.points[route.points.length - 1]!;
    expect(Math.hypot(last.x - flower.position.x, last.z - flower.position.z)).toBeLessThan(1.2);
    for (const a of route.actions) {
      expect(a.at).toBeGreaterThanOrEqual(0);
      expect(a.at).toBeLessThan(route.points.length);
    }
    expect(route.actions.map((a) => a.do).sort()).toEqual(['blink', 'doubleJump', 'jump', 'jump']);
  });

  it('without the Blink the bot does not get past the bars in 1800 steps', async () => {
    const sim = await createSim(BACKROOMS);
    const trace = recorded(sim);
    const run = walkRoute(sim, route, MAX, { level: BACKROOMS, skip: ['blink'] });
    const barsZ = bars[0]!.center.z;
    expect(run.steps).toBe(MAX);
    expect(types(run.events)).not.toContain('flowerEntered');
    expect(types(run.events)).not.toContain('blinked');
    expect(Math.max(...trace.map((p) => p.z))).toBeLessThan(barsZ);
    expect(Math.max(...trace.map((p) => p.z))).toBeGreaterThan(barsZ - 2); // дійшла до ґрат: упирається в них, а не застрягла раніше
    sim.dispose();
  });

  it('without the double jump the bot never gets on the ledge', async () => {
    const sim = await createSim(BACKROOMS);
    const trace = recorded(sim);
    const run = walkRoute(sim, route, MAX, { level: BACKROOMS, skip: ['doubleJump'] });
    const ledge = lowBlocks.find((b) => top(b) > TUNING.jumpHeight)!;
    expect(types(run.events)).not.toContain('flowerEntered');
    expect(trace.filter((p) => p.y > top(ledge) - 0.5 && Math.abs(p.z - ledge.center.z) < ledge.halfExtents.z)).toEqual([]);
    expect(Math.max(...trace.map((p) => p.z))).toBeLessThan(ledge.center.z); // не пройшла далі уступу
    expect(Math.max(...trace.map((p) => p.z))).toBeGreaterThan(ledge.center.z - ledge.halfExtents.z - 1.5); // стоїть біля нього
    sim.dispose();
  });

  it('without the first jump she stays before the step', async () => {
    const sim = await createSim(BACKROOMS);
    const trace = recorded(sim);
    walkRoute(sim, route, 600, { level: BACKROOMS, skip: ['jump'] });
    const step = lowBlocks.filter((b) => top(b) < TUNING.jumpHeight).sort((a, b) => a.center.z - b.center.z)[0]!;
    expect(Math.max(...trace.map((p) => p.z))).toBeLessThan(step.center.z);
    sim.dispose();
  });
});

describe('the intro of the backrooms', () => {
  const press = { ...NO_INPUT, moveX: 1, moveZ: 1, jump: true };

  it('for the first introSeconds the keys move nothing; after that they do', async () => {
    const sim = await createSim(BACKROOMS);
    const n = Math.round(TUNING.worlds.introSeconds / TUNING.step);
    const start = { ...sim.sofiyka.position };
    const events: SimEvent[] = [];
    for (let i = 0; i < n; i++) events.push(...sim.step(press));
    expect(sim.sofiyka.position.x).toBeCloseTo(start.x, 3);
    expect(sim.sofiyka.position.y).toBeCloseTo(start.y, 1);
    expect(sim.sofiyka.position.z).toBeCloseTo(start.z, 3);
    expect(sim.sofiyka.facing).toBe(0);
    expect(events).toEqual([]);
    expect(sim.time).toBeCloseTo(TUNING.worlds.introSeconds, 6); // час ігровий іде
    for (let i = 0; i < 30; i++) sim.step({ ...NO_INPUT, moveX: -1 });
    expect(sim.sofiyka.position.x).toBeLessThan(start.x - 1);
    sim.dispose();
  });

  it('the last intro step still ignores the keys and the first one after it takes them', async () => {
    const sim = await createSim(BACKROOMS);
    const n = Math.round(TUNING.worlds.introSeconds / TUNING.step);
    for (let i = 0; i < n - 1; i++) sim.step(NO_INPUT);
    sim.step({ ...NO_INPUT, moveX: 1 });
    expect(sim.sofiyka.position.x).toBeCloseTo(BACKROOMS.spawn.x, 3);
    sim.step({ ...NO_INPUT, moveX: 1 });
    expect(sim.sofiyka.position.x).toBeGreaterThan(BACKROOMS.spawn.x + 0.05);
    sim.dispose();
  });

  it('the village takes the keys from the first step', async () => {
    const sim = await createSim(VILLAGE);
    sim.step({ ...NO_INPUT, moveX: 1 });
    expect(sim.sofiyka.position.x).toBeGreaterThan(VILLAGE.spawn.x + 0.05);
    sim.dispose();
  });

  it('a level without intro takes the keys at once even when the game time is under introSeconds', async () => {
    const plain: Level = { ...BACKROOMS, intro: undefined };
    const sim = await createSim(plain);
    sim.step({ ...NO_INPUT, moveX: 1 });
    expect(sim.sofiyka.position.x).toBeGreaterThan(BACKROOMS.spawn.x + 0.05);
    sim.dispose();
  });
});
