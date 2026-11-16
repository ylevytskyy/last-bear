import { describe, expect, it } from 'vitest';
import { VILLAGE } from '../levels/village';
import type { Block, Level, Vec3 } from './level';
import { TUNING } from './tuning';
import { levelBlocks } from './village-geometry';

const real = VILLAGE.cages!.find((c) => c.working)!;
const facingDir = { x: Math.sin(real.facing), z: Math.cos(real.facing) };
const ahead = (distance: number): Vec3 => ({ x: real.position.x + facingDir.x * distance, y: real.position.y, z: real.position.z + facingDir.z * distance });
const yellow = VILLAGE.flowers!.find((f) => f.opens)!;
const trail = VILLAGE.trail!;
const BLOCKS = levelBlocks(VILLAGE, new Set(), TUNING);

/** Точки вздовж ламаної, не рідше ніж кожні 0.25 м. */
function sample(path: Vec3[]): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y, z: a.z + ((b.z - a.z) * k) / n });
  }
  out.push(path[path.length - 1]!);
  return out;
}
/** Чи перетинає відрізок xz (на висоті `y`) коробку, розширену на `margin` по xz. Аналітично, за плитами. */
function segmentHitsBlock(a: Vec3, b: Vec3, y: number, bl: Block, margin: number): boolean {
  if (y < bl.center.y - bl.halfExtents.y || y > bl.center.y + bl.halfExtents.y) return false;
  let t0 = 0;
  let t1 = 1;
  for (const axis of ['x', 'z'] as const) {
    const lo = bl.center[axis] - bl.halfExtents[axis] - margin;
    const hi = bl.center[axis] + bl.halfExtents[axis] + margin;
    const d = b[axis] - a[axis];
    if (Math.abs(d) < 1e-12) {
      if (a[axis] < lo || a[axis] > hi) return false;
    } else {
      const ta = (lo - a[axis]) / d;
      const tb = (hi - a[axis]) / d;
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
      if (t0 > t1) return false;
    }
  }
  return true;
}
/** Відстань від точки на землі до ворога так, як її міряє ворог: Бджола — 3D до центра капсули, Черепаха — по xz. */
function enemyDistance(level: Level, p: Vec3, id: string): number {
  const e = level.enemies!.find((x) => x.id === id)!;
  if (e.kind === 'turtle') return Math.hypot(p.x - e.position.x, p.z - e.position.z);
  return Math.hypot(p.x - e.position.x, p.y + TUNING.capsuleHeight / 2 - e.position.y, p.z - e.position.z);
}
const aggro = (kind: 'bee' | 'turtle') => (kind === 'bee' ? TUNING.bee.aggroRadius : TUNING.turtle.aggroRadius);

describe('VILLAGE as a level', () => {
  it('has five cages with exactly one working, three flowers with exactly the yellow one opening, a survivor, three enemies', () => {
    expect(VILLAGE.cages).toHaveLength(5);
    expect(VILLAGE.cages!.filter((c) => c.working)).toHaveLength(1);
    expect(new Set(VILLAGE.cages!.map((c) => c.id)).size).toBe(5);
    expect(VILLAGE.flowers!.map((f) => f.color).sort()).toEqual(['blue', 'pink', 'yellow']);
    expect(VILLAGE.flowers!.filter((f) => f.opens).map((f) => f.color)).toEqual(['yellow']);
    expect(VILLAGE.survivor).toBeDefined();
    expect(VILLAGE.enemies!.filter((e) => e.kind === 'turtle')).toHaveLength(1);
    expect(VILLAGE.enemies!.filter((e) => e.kind === 'bee')).toHaveLength(2);
    expect(VILLAGE.blocks.filter((b) => b.look === 'house')).toHaveLength(4);
  });

  it('is a flat 40 by 40 m square with no gap, the cages in a row 4 m apart on the north edge, doors to the south', () => {
    const ground = VILLAGE.blocks.find((b) => b.look === 'ground' || b.look === undefined)!;
    expect(ground.halfExtents.x).toBe(20);
    expect(ground.halfExtents.z).toBe(20);
    expect(ground.center.y + ground.halfExtents.y).toBe(0);
    const row = [...VILLAGE.cages!].sort((a, b) => a.position.x - b.position.x);
    for (let i = 1; i < row.length; i++) expect(row[i]!.position.x - row[i - 1]!.position.x).toBeCloseTo(4, 9);
    for (const c of row) {
      expect(c.position.z).toBe(row[0]!.position.z);
      expect(c.position.z).toBeGreaterThan(10);
      expect(Math.cos(c.facing)).toBeCloseTo(-1, 9); // двері на південь (−z)
    }
    expect(VILLAGE.flowers!.every((f) => f.position.x > 10)).toBe(true); // схід
    expect(VILLAGE.enemies!.every((e) => e.position.x < -5)).toBe(true); // захід
    expect(VILLAGE.spawn.z).toBeLessThan(-10); // південь
    expect(VILLAGE.survivor!.position.z).toBeLessThan(-10);
  });

  it('the trails run from the survivor, one to the yellow flower and one to 2.5 m in front of the real cage door', () => {
    const s = VILLAGE.survivor!.position;
    expect(Math.hypot(trail.flower[0]!.x - s.x, trail.flower[0]!.z - s.z)).toBeLessThan(3);
    expect(Math.hypot(trail.cage[0]!.x - s.x, trail.cage[0]!.z - s.z)).toBeLessThan(3);
    const flowerEnd = trail.flower[trail.flower.length - 1]!;
    expect(Math.hypot(flowerEnd.x - yellow.position.x, flowerEnd.z - yellow.position.z)).toBeGreaterThan(TUNING.village.flowerEnterRadius);
    expect(Math.hypot(flowerEnd.x - yellow.position.x, flowerEnd.z - yellow.position.z)).toBeLessThan(5);
    const cageEnd = trail.cage[trail.cage.length - 1]!;
    const door = ahead(TUNING.village.cageSize / 2 + 2.5);
    expect(cageEnd.x).toBeCloseTo(door.x, 9);
    expect(cageEnd.z).toBeCloseTo(door.z, 9);
  });

  it('keeps every spawn, checkpoint, trail point and flower farther than aggroRadius + 1 m from every enemy', () => {
    const checkpoint = ahead(TUNING.village.cageCheckpointDistance);
    const points: [string, Vec3][] = [
      ['spawn', VILLAGE.spawn],
      ['survivor', VILLAGE.survivor!.position],
      ['cage checkpoint', checkpoint],
      ...sample(trail.flower).map((p, i): [string, Vec3] => [`flower trail ${i}`, p]),
      ...sample(trail.cage).map((p, i): [string, Vec3] => [`cage trail ${i}`, p]),
      ...VILLAGE.flowers!.map((f): [string, Vec3] => [`flower ${f.id}`, f.position]),
    ];
    for (const e of VILLAGE.enemies!) {
      for (const [name, p] of points) {
        expect(enemyDistance(VILLAGE, p, e.id), `${name} vs ${e.id}`).toBeGreaterThan(aggro(e.kind) + 1);
      }
    }
  });

  it('keeps the trails, the spawn and the cage checkpoint clear of every block, at the heights of the capsule', () => {
    const r = TUNING.capsuleRadius;
    for (const path of [trail.flower, trail.cage]) {
      for (let i = 0; i + 1 < path.length; i++) {
        for (const y of [0.05, TUNING.capsuleHeight / 2, TUNING.capsuleHeight - 0.05]) {
          for (const b of BLOCKS) {
            expect(segmentHitsBlock(path[i]!, path[i + 1]!, y, b, r), `segment ${i} at y ${y} vs ${JSON.stringify(b.center)}`).toBe(false);
          }
        }
      }
    }
    for (const p of [VILLAGE.spawn, ahead(TUNING.village.cageCheckpointDistance), VILLAGE.survivor!.position]) {
      for (const b of BLOCKS) expect(segmentHitsBlock(p, p, 0.7, b, r), JSON.stringify(p)).toBe(false);
    }
  });

  it('the segment check really notices a block in the way', () => {
    const wall: Block = { kind: 'solid', center: { x: 0, y: 1, z: 0 }, halfExtents: { x: 0.1, y: 1, z: 5 } };
    expect(segmentHitsBlock({ x: -3, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, 0.7, wall, 0.4)).toBe(true);
    expect(segmentHitsBlock({ x: -3, y: 0, z: 6 }, { x: 3, y: 0, z: 6 }, 0.7, wall, 0.4)).toBe(false);
  });
});
