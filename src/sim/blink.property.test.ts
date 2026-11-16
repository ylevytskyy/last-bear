import { describe, expect, it } from 'vitest';
import { resolveBlink } from './blink';
import type { Block, Level, Vec3 } from './level';
import { TUNING } from './tuning';
import { buildLevel, createWorld } from './world';

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

/** Незалежна перевірка: відстань від вертикального відрізка капсули до коробки (точна, без Rapier). */
function capsuleClearance(soles: Vec3, b: Block): number {
  const r = TUNING.capsuleRadius;
  const segLo = soles.y + r;
  const segHi = soles.y + TUNING.capsuleHeight - r;
  const gap = (lo: number, hi: number, c: number, h: number) => Math.max(0, c - h - hi, lo - (c + h));
  const dx = gap(soles.x, soles.x, b.center.x, b.halfExtents.x);
  const dz = gap(soles.z, soles.z, b.center.z, b.halfExtents.z);
  const dy = gap(segLo, segHi, b.center.y, b.halfExtents.y);
  return Math.hypot(dx, dy, dz) - r; // < 0 означає перетин
}

describe('Blink never ends inside geometry', () => {
  it('holds for 1000 random positions and directions', async () => {
    const rand = rng(20261115);
    const between = (lo: number, hi: number) => lo + (hi - lo) * rand();
    const blocks: Block[] = [];
    for (let i = 0; i < 14; i++) {
      blocks.push({
        kind: rand() < 0.5 ? 'solid' : 'bars',
        center: { x: between(-12, 12), y: 1, z: between(-12, 12) },
        halfExtents: { x: between(0.3, 2), y: 1, z: between(0.3, 2) },
      });
    }
    const floor: Block = {
      kind: 'solid',
      center: { x: 0, y: -0.5, z: 0 },
      halfExtents: { x: 40, y: 0.5, z: 40 },
    };
    const level: Level = { blocks: [floor, ...blocks], spawn: { x: 0, y: 0, z: 0 }, killY: -20 };
    const { world } = await createWorld();
    buildLevel(world, level);

    let moved = 0;
    let checked = 0;
    while (checked < 1000) {
      const from = { x: between(-14, 14), y: 0, z: between(-14, 14) };
      if (blocks.some((b) => capsuleClearance(from, b) < 0.02)) continue; // дозволена позиція
      checked++;
      const facing = between(-Math.PI, Math.PI);
      const to = resolveBlink(world, from, facing, TUNING);
      if (to === null) continue;
      moved++;
      for (const b of blocks) {
        expect(capsuleClearance(to, b), `from ${JSON.stringify(from)} facing ${facing}`).toBeGreaterThanOrEqual(-0.005);
      }
      expect(to.y).toBe(from.y);
      expect(Math.hypot(to.x - from.x, to.z - from.z)).toBeLessThanOrEqual(TUNING.blinkDistance + 1e-6);
    }
    expect(moved).toBeGreaterThan(500); // тест не порожній: більшість Blink відбулась
    world.free();
  });
});
