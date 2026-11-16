import { describe, expect, it } from 'vitest';
import { HONEYCOMBS } from '../levels/honeycombs';
import { NO_INPUT } from './input';
import type { Block, Level, Route, Vec3 } from './level';
import { walkRoute } from './route';
import { createSim, type SimEvent } from './sim';
import { TUNING } from './tuning';
import { levelBlocks } from './village-geometry';

const types = (events: SimEvent[]) => events.map((e) => e.type);
const NO_BEES: Level = { ...HONEYCOMBS, enemies: [] };
const route = HONEYCOMBS.route!;
const flower = HONEYCOMBS.flowers![0]!;
const source = HONEYCOMBS.source!;
const MAX = 9000;
const top = (b: Block) => b.center.y + b.halfExtents.y;
const strikeIndex = route.actions.find((a) => a.do === 'strikeSource')!.at;
const stand = route.points[strikeIndex]!;

type Platform = { blocks: Block[]; left: number; right: number; back: number; front: number; top: number };
/** Платформа — блоки з однаковим верхом, що торкаються одне одного по xz. */
function platformsOf(blocks: Block[]): Platform[] {
  const groups: Block[][] = [];
  const touches = (a: Block, b: Block) =>
    Math.abs(top(a) - top(b)) < 1e-6 &&
    Math.abs(a.center.x - b.center.x) <= a.halfExtents.x + b.halfExtents.x + 1e-9 &&
    Math.abs(a.center.z - b.center.z) <= a.halfExtents.z + b.halfExtents.z + 1e-9;
  for (const b of blocks) {
    const hit = groups.filter((g) => g.some((o) => touches(o, b)));
    const merged = [b, ...hit.flat()];
    for (const g of hit) groups.splice(groups.indexOf(g), 1);
    groups.push(merged);
  }
  return groups.map((g) => ({
    blocks: g,
    left: Math.min(...g.map((b) => b.center.x - b.halfExtents.x)),
    right: Math.max(...g.map((b) => b.center.x + b.halfExtents.x)),
    back: Math.min(...g.map((b) => b.center.z - b.halfExtents.z)),
    front: Math.max(...g.map((b) => b.center.z + b.halfExtents.z)),
    top: top(g[0]!),
  }));
}
const STATIC = platformsOf(HONEYCOMBS.blocks);
const across = (p: { left: number; right: number; back: number; front: number }) => Math.min(p.right - p.left, p.front - p.back);
/** Відстань від центра капсули Софійки на платформі (над найближчою точкою верху) до точки. */
function distanceFromPlatform(p: { left: number; right: number; back: number; front: number; top: number }, at: Vec3): number {
  const x = Math.min(p.right, Math.max(p.left, at.x));
  const z = Math.min(p.front, Math.max(p.back, at.z));
  return Math.hypot(at.x - x, at.y - (p.top + TUNING.capsuleHeight / 2), at.z - z);
}

describe('HONEYCOMBS as a level: the plan numbers, counted from the data', () => {
  it('has hexagon platforms of several blocks each, a pit under them, two movers, three bees, a source, a back flower and a sign', () => {
    expect(STATIC.length).toBeGreaterThanOrEqual(6);
    for (const p of STATIC) expect(p.blocks.length).toBeGreaterThanOrEqual(2);
    expect(HONEYCOMBS.blocks.every((b) => b.kind === 'solid')).toBe(true);
    expect(HONEYCOMBS.killY).toBeLessThan(Math.min(...HONEYCOMBS.blocks.map((b) => b.center.y - b.halfExtents.y)) - 5);
    expect(HONEYCOMBS.movers).toHaveLength(2);
    expect(HONEYCOMBS.enemies!.filter((e) => e.kind === 'bee')).toHaveLength(3);
    expect(HONEYCOMBS.enemies).toHaveLength(3);
    expect(flower.to).toBe('village');
    expect(flower.opensWhen).toBe('keyHeld');
    expect(HONEYCOMBS.signs!.flatMap((s) => s.keys)).toEqual(['strike']);
    expect(HONEYCOMBS.entries!.village).toEqual(HONEYCOMBS.spawn);
    expect(HONEYCOMBS.intro).toBeUndefined();
  });

  it('every platform a bee is closer to than its aggroRadius is at least 6 m across', () => {
    const near: string[] = [];
    for (const e of HONEYCOMBS.enemies!) {
      for (const p of STATIC) {
        if (distanceFromPlatform(p, e.position) < TUNING.bee.aggroRadius) {
          near.push(`${e.id}@${p.left.toFixed(1)}`);
          expect(across(p), `${e.id} sees the platform at x ${p.left.toFixed(1)}..${p.right.toFixed(1)}`).toBeGreaterThanOrEqual(6);
        }
      }
    }
    expect(near.length).toBeGreaterThanOrEqual(5); // правило справді комусь потрібне
    // Правило не порожнє: на рівні є й малі платформи, і їх жодна Бджола не бачить.
    const small = STATIC.filter((p) => across(p) < 6);
    expect(small.length).toBeGreaterThanOrEqual(2);
    for (const e of HONEYCOMBS.enemies!) for (const p of small) expect(distanceFromPlatform(p, e.position)).toBeGreaterThan(TUNING.bee.aggroRadius);
  });

  it('no bee comes within aggroRadius of any place a moving platform goes (they are smaller than 6 m)', () => {
    for (const m of HONEYCOMBS.movers!) {
      const swept = {
        left: Math.min(m.block.center.x, m.to.x) - m.block.halfExtents.x,
        right: Math.max(m.block.center.x, m.to.x) + m.block.halfExtents.x,
        back: Math.min(m.block.center.z, m.to.z) - m.block.halfExtents.z,
        front: Math.max(m.block.center.z, m.to.z) + m.block.halfExtents.z,
        top: top(m.block),
      };
      expect(across({ left: m.block.center.x - m.block.halfExtents.x, right: m.block.center.x + m.block.halfExtents.x, back: m.block.center.z - m.block.halfExtents.z, front: m.block.center.z + m.block.halfExtents.z })).toBeLessThan(6);
      for (const e of HONEYCOMBS.enemies!) expect(distanceFromPlatform(swept, e.position), `${e.id} vs ${m.id}`).toBeGreaterThan(TUNING.bee.aggroRadius);
    }
  });

  it('one bee is closer than 9 m to the place where she strikes the source, and is not dormant there', () => {
    const centre = { x: stand.x, y: stand.y + TUNING.capsuleHeight / 2, z: stand.z };
    const close = HONEYCOMBS.enemies!.filter((e) => Math.hypot(e.position.x - centre.x, e.position.y - centre.y, e.position.z - centre.z) < 9);
    expect(close.map((e) => e.id)).toEqual(['bee-2']);
    expect(TUNING.bee.aggroRadius).toBe(9);
  });

  it('the entry is farther than aggroRadius + 1 m from every bee', () => {
    const e = HONEYCOMBS.entries!.village!;
    for (const bee of HONEYCOMBS.enemies!) {
      expect(Math.hypot(e.x - bee.position.x, e.y + TUNING.capsuleHeight / 2 - bee.position.y, e.z - bee.position.z)).toBeGreaterThan(TUNING.bee.aggroRadius + 1);
    }
  });

  it('the source stands on a wide platform: the stand, the source and the dropped key are all on it, with 1 m to spare', () => {
    const p = STATIC.find((q) => q.left < stand.x && stand.x < q.right && q.front - q.back >= 6)!;
    expect(p).toBeDefined();
    expect(p.top).toBe(source.position.y);
    const key = { x: source.position.x - TUNING.source.halfWidth - TUNING.source.keyDropDistance, z: 0 };
    for (const at of [stand, key, source.position]) {
      const onIt = p.blocks.some((b) => Math.abs(at.x - b.center.x) < b.halfExtents.x - 1 && Math.abs(at.z - b.center.z) < b.halfExtents.z - 0.2);
      expect(onIt, JSON.stringify(at)).toBe(true);
    }
    // Стоячи там, Удар дістає до грані казана.
    expect(source.position.x - TUNING.source.halfWidth - (stand.x + TUNING.strikeReach)).toBeLessThan(TUNING.strikeRadius);
    // Ключ падає між нею і казаном, недалеко: кілька кроків до нього.
    expect(key.x - stand.x).toBeGreaterThan(TUNING.source.pickupRadius);
    expect(key.x - stand.x).toBeLessThan(TUNING.source.pickupRadius + 0.5);
  });

  it('the trail leads from the entry to the stand, then from the stand to the flower', () => {
    const t = HONEYCOMBS.trail!;
    expect(t.flower[0]).toEqual(HONEYCOMBS.spawn);
    expect(t.flower[t.flower.length - 1]).toEqual(stand);
    expect(t.cage[0]).toEqual(stand);
    const end = t.cage[t.cage.length - 1]!;
    expect(Math.hypot(end.x - flower.position.x, end.z - flower.position.z)).toBeLessThan(2);
    expect(Math.hypot(end.x - flower.position.x, end.z - flower.position.z)).toBeGreaterThan(TUNING.village.flowerEnterRadius - 0.6);
  });

  it('the route covers the whole way: double jumps on the gaps, waits for both movers at both ends, strikes the source', () => {
    const acts = route.actions.map((a) => a.do);
    expect(acts.filter((a) => a === 'doubleJump').length).toBeGreaterThanOrEqual(3);
    expect(acts.filter((a) => a === 'strikeSource')).toHaveLength(1);
    for (const m of HONEYCOMBS.movers!) {
      expect(acts).toContainEqual({ waitMover: m.id, near: 'A' });
      expect(acts).toContainEqual({ waitMover: m.id, near: 'B' });
    }
    expect(route.points[0]).toEqual(HONEYCOMBS.spawn);
    const last = route.points[route.points.length - 1]!;
    expect(Math.hypot(last.x - flower.position.x, last.z - flower.position.z)).toBeLessThan(1.2);
    for (const a of route.actions) expect(a.at).toBeLessThan(route.points.length);
  });
});

describe('walking the route of HONEYCOMBS (bees switched off)', () => {
  it('the bot breaks the source, picks up the key and jumps into the flower within 9000 steps without falling', async () => {
    const sim = await createSim(NO_BEES);
    const run = walkRoute(sim, route, MAX, { level: NO_BEES });
    expect(run.reached).toBe(route.points.length - 1);
    expect(run.steps).toBeLessThanOrEqual(MAX);
    expect(run.events.filter((e) => e.type === 'sourceStruck').map((e) => (e.type === 'sourceStruck' ? e.hp : -1))).toEqual([2, 1, 0]);
    expect(types(run.events)).toContain('sourceBroken');
    expect(types(run.events)).toContain('keyPicked');
    expect(run.events.filter((e) => e.type === 'flowerEntered')).toEqual([{ type: 'flowerEntered', id: flower.id }]);
    expect(types(run.events).indexOf('keyPicked')).toBeLessThan(types(run.events).indexOf('flowerEntered'));
    expect(types(run.events)).not.toContain('heartLost');
    expect(types(run.events)).not.toContain('returned');
    expect(sim.sofiyka.hearts).toBe(TUNING.hearts);
    expect(sim.sofiyka.keys).toBe(1);
    sim.dispose();
  }, 60000);

  it('from any phase of the platforms (0, 37, 113, 201 steps of waiting at the start) the same route works', async () => {
    for (const wait of [0, 37, 113, 201]) {
      const sim = await createSim(NO_BEES);
      for (let i = 0; i < wait; i++) sim.step(NO_INPUT);
      const run = walkRoute(sim, route, MAX, { level: NO_BEES });
      expect(types(run.events), `after ${wait} steps`).toContain('flowerEntered');
      expect(types(run.events), `after ${wait} steps`).not.toContain('returned');
      expect(types(run.events), `after ${wait} steps`).not.toContain('heartLost');
      sim.dispose();
    }
  }, 120000);

  it('the back flower is a bud for her without the key and opens with it (cauldron taken away so the route is free)', async () => {
    const free: Level = { ...NO_BEES, source: undefined };
    const without = await createSim(free);
    const run = walkRoute(without, route, MAX, { level: free, skip: ['strikeSource'] });
    expect(run.reached).toBe(route.points.length - 1);
    expect(types(run.events)).not.toContain('keyPicked');
    expect(types(run.events)).not.toContain('flowerEntered');
    expect(without.flowers.find((f) => f.id === flower.id)!.openness).toBe(0);
    without.dispose();
    const keyed = await createSim(free, TUNING, { keys: 1 });
    const again = walkRoute(keyed, route, MAX, { level: free, skip: ['strikeSource'] });
    expect(types(again.events)).toContain('flowerEntered');
    keyed.dispose();
  }, 60000);

  it('without the strikes the route stops at the cauldron: no key, and she does not get through it', async () => {
    const sim = await createSim(NO_BEES);
    const run = walkRoute(sim, route, 3000, { level: NO_BEES, skip: ['strikeSource'] });
    expect(types(run.events)).not.toContain('keyPicked');
    expect(types(run.events)).not.toContain('flowerEntered');
    expect(sim.sofiyka.position.x).toBeLessThan(source.position.x - TUNING.source.halfWidth);
    sim.dispose();
  }, 60000);

  it('without the double jumps she never gets as far as the second platform after the movers', async () => {
    const sim = await createSim(NO_BEES);
    const run = walkRoute(sim, route, 3000, { level: NO_BEES, skip: ['doubleJump'] });
    expect(types(run.events)).not.toContain('flowerEntered');
    expect(sim.sofiyka.position.x).toBeLessThan(route.points[8]!.x);
    sim.dispose();
  }, 60000);
});

describe('falling in HONEYCOMBS', () => {
  it('off a still platform costs a heart and puts her back on the last still safe ground of that platform', async () => {
    const sim = await createSim(NO_BEES);
    const events: SimEvent[] = [];
    for (let i = 0; i < 400 && !types(events).includes('returned'); i++) events.push(...sim.step({ ...NO_INPUT, moveZ: 1 }));
    expect(events.filter((e) => e.type === 'heartLost')).toEqual([{ type: 'heartLost', cause: 'fall' }]);
    const back = events.find((e) => e.type === 'returned');
    if (back?.type !== 'returned') throw new Error('no returned event');
    const p0 = STATIC.find((p) => p.left < 0 && p.right > 0)!;
    expect(back.to.x).toBeGreaterThan(p0.left);
    expect(back.to.x).toBeLessThan(p0.right);
    expect(back.to.z).toBeLessThan(p0.front);
    expect(back.to.y).toBeCloseTo(p0.top, 1);
    expect(sim.sofiyka.hearts).toBe(TUNING.hearts - 1);
    sim.dispose();
  });

  it('off a moving platform she is returned to the still platform she came from, not to where the mover was', async () => {
    const sim = await createSim(NO_BEES);
    const upToMover: Route = { points: route.points.slice(0, 4), actions: route.actions.filter((a) => a.at < 4) };
    const run = walkRoute(sim, upToMover, 3000, { level: NO_BEES });
    expect(run.reached).toBe(3);
    // Стоїть на першій рухомій: іде вбік у прірву.
    const events: SimEvent[] = [];
    for (let i = 0; i < 400 && !types(events).includes('returned'); i++) events.push(...sim.step({ ...NO_INPUT, moveZ: 1 }));
    const back = events.find((e) => e.type === 'returned');
    if (back?.type !== 'returned') throw new Error('no returned event');
    const p1 = STATIC.find((p) => p.left < route.points[2]!.x && route.points[2]!.x < p.right)!;
    expect(back.to.x).toBeGreaterThan(p1.left);
    expect(back.to.x).toBeLessThan(p1.right);
    expect(back.to.y).toBeCloseTo(p1.top, 1);
    sim.dispose();
  }, 30000);

  it('with no hearts left after the key was picked she is back at the entry with the key still hers', async () => {
    const sim = await createSim(NO_BEES, TUNING, { hearts: 1 });
    const toKey: Route = { points: route.points.slice(0, strikeIndex + 1), actions: route.actions.filter((a) => a.at <= strikeIndex) };
    const run = walkRoute(sim, toKey, MAX, { level: NO_BEES });
    expect(types(run.events)).toContain('keyPicked');
    expect(sim.sofiyka.keys).toBe(1);
    const events: SimEvent[] = [];
    for (let i = 0; i < 600 && !types(events).includes('respawned'); i++) events.push(...sim.step({ ...NO_INPUT, moveZ: 1 }));
    expect(types(events)).toContain('respawned');
    expect(sim.sofiyka.hearts).toBe(TUNING.hearts);
    expect(sim.sofiyka.keys).toBe(1);
    expect(sim.sofiyka.position.x).toBeCloseTo(HONEYCOMBS.entries!.village!.x, 3);
    expect(sim.sofiyka.position.z).toBeCloseTo(HONEYCOMBS.entries!.village!.z, 3);
    expect(sim.source).toEqual({ hp: 0, broken: true, keyAt: null });
    sim.dispose();
  }, 60000);

  it('levelBlocks holds the platforms, the movers at A, the cauldron and the flower stem: the same world the rules start with', () => {
    const blocks = levelBlocks(HONEYCOMBS, new Set(), TUNING);
    expect(blocks.length).toBe(HONEYCOMBS.blocks.length + 2 + 1 + 1);
    expect(blocks.filter((b) => b.look === 'stem')).toHaveLength(1);
    expect(blocks.filter((b) => b.look === 'source')).toHaveLength(1);
  });
});
