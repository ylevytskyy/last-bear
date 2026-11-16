import { describe, expect, it } from 'vitest';
import { ARENA } from '../levels/arena';
import { resolveBlink } from './blink';
import type { Block, Vec3 } from './level';
import { TUNING } from './tuning';
import { buildLevel, createWorld } from './world';

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
  return Math.hypot(dx, dy, dz) - r;
}

describe('Blink never ends inside the arena geometry', () => {
  it('holds for 1000 random positions and directions', async () => {
    const { world } = await createWorld();
    buildLevel(world, ARENA);
    const rand = rng(20261117);
    const between = (lo: number, hi: number) => lo + (hi - lo) * rand();
    let checked = 0;
    let moved = 0;
    while (checked < 1000) {
      const from = { x: between(-15, 15), y: 0, z: between(-15, 15) };
      if (ARENA.blocks.some((b) => capsuleClearance(from, b) < 0.02 && b.center.y > 0)) continue;
      checked++;
      const facing = between(-Math.PI, Math.PI);
      const to = resolveBlink(world, from, facing, TUNING);
      if (to === null) continue;
      moved++;
      for (const b of ARENA.blocks) {
        expect(capsuleClearance(to, b), `from ${JSON.stringify(from)} facing ${facing}`).toBeGreaterThanOrEqual(-0.005);
      }
    }
    expect(moved).toBeGreaterThan(500);
    world.free();
  });
});
