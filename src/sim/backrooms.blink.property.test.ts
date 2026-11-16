import { describe, expect, it } from 'vitest';
import { BACKROOMS } from '../levels/backrooms';
import { resolveBlink } from './blink';
import type { Block, Vec3 } from './level';
import { TUNING } from './tuning';
import { levelBlocks } from './village-geometry';
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

describe('Blink never ends inside the backrooms geometry', () => {
  it('holds for 1000 random positions and directions in the room, bars, step and ledge included', async () => {
    const blocks = levelBlocks(BACKROOMS, new Set(), TUNING);
    const floor = BACKROOMS.blocks.find((b) => b.center.y + b.halfExtents.y === 0 && b.halfExtents.x >= 7.5)!;
    const { world } = await createWorld();
    buildLevel(world, BACKROOMS);
    const rand = rng(20261119);
    const between = (lo: number, hi: number) => lo + (hi - lo) * rand();
    const x0 = floor.center.x - floor.halfExtents.x + 0.5;
    const x1 = floor.center.x + floor.halfExtents.x - 0.5;
    const z0 = floor.center.z - floor.halfExtents.z + 0.5;
    const z1 = floor.center.z + floor.halfExtents.z - 0.5;
    let checked = 0;
    let moved = 0;
    let throughBars = 0;
    let fromTops = 0;
    while (checked < 1000) {
      const xz = { x: between(x0, x1), z: between(z0, z1) };
      // Стоїть на найвищому суцільному блоці під собою (підлога, сходинка, уступ).
      const under = blocks
        .filter((b) => b.kind === 'solid' && Math.abs(xz.x - b.center.x) < b.halfExtents.x && Math.abs(xz.z - b.center.z) < b.halfExtents.z && b.center.y + b.halfExtents.y < 3)
        .map((b) => b.center.y + b.halfExtents.y);
      const y = Math.max(0, ...under);
      const from = { ...xz, y };
      // Не всередині блока й не впритул до нього (опорний блок — під підошвами, його пропускаємо).
      if (blocks.some((b) => capsuleClearance(from, b) < 0.02 && !(b.kind === 'solid' && Math.abs(b.center.y + b.halfExtents.y - y) < 1e-9 && Math.abs(xz.x - b.center.x) < b.halfExtents.x && Math.abs(xz.z - b.center.z) < b.halfExtents.z))) continue;
      checked++;
      if (y > 0) fromTops++;
      const facing = between(-Math.PI, Math.PI);
      const to = resolveBlink(world, from, facing, TUNING);
      if (to === null) continue;
      moved++;
      if (blocks.some((b) => b.kind === 'bars' && Math.min(from.z, to.z) < b.center.z && Math.max(from.z, to.z) > b.center.z)) throughBars++;
      for (const b of blocks) {
        expect(capsuleClearance(to, b), `from ${JSON.stringify(from)} facing ${facing}`).toBeGreaterThanOrEqual(-0.005);
      }
    }
    expect(moved).toBeGreaterThan(500);
    expect(throughBars).toBeGreaterThan(0); // вибірка справді проходить крізь ґрати
    expect(fromTops).toBeGreaterThan(0); // і стартує зі сходинки та уступу
    world.free();
  });
});
