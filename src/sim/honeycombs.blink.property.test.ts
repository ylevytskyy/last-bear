import { describe, expect, it } from 'vitest';
import { HONEYCOMBS } from '../levels/honeycombs';
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

describe('Blink never ends inside the honeycombs geometry', () => {
  it('holds for 1000 random positions on random platforms, the cauldron and the movers (at A) included', async () => {
    const blocks = levelBlocks(HONEYCOMBS, new Set(), TUNING);
    const platforms = blocks.filter((b) => b.look !== 'source');
    const { world } = await createWorld();
    buildLevel(world, HONEYCOMBS);
    const rand = rng(20261120);
    const between = (lo: number, hi: number) => lo + (hi - lo) * rand();
    const INSET = 0.5;
    let checked = 0;
    let moved = 0;
    let overVoid = 0;
    const platformsHit = new Set<number>();
    while (checked < 1000) {
      // Випадковий блок платформи; точка в межах його верху з відступом 0.5 м.
      const index = Math.floor(rand() * platforms.length);
      const b = platforms[index]!;
      if (b.halfExtents.x <= INSET || b.halfExtents.z <= INSET) continue;
      const from = {
        x: between(b.center.x - b.halfExtents.x + INSET, b.center.x + b.halfExtents.x - INSET),
        y: b.center.y + b.halfExtents.y,
        z: between(b.center.z - b.halfExtents.z + INSET, b.center.z + b.halfExtents.z - INSET),
      };
      // Не всередині іншого блока й не впритул до нього (казана, іншої платформи вище); верх свого блока — це земля.
      if (blocks.some((o) => capsuleClearance(from, o) < 0.02 && !(o.kind === 'solid' && Math.abs(o.center.y + o.halfExtents.y - from.y) < 1e-9 && Math.abs(from.x - o.center.x) <= o.halfExtents.x && Math.abs(from.z - o.center.z) <= o.halfExtents.z))) continue;
      checked++;
      platformsHit.add(index);
      const facing = between(-Math.PI, Math.PI);
      const to = resolveBlink(world, from, facing, TUNING);
      if (to === null) continue;
      moved++;
      if (!blocks.some((o) => Math.abs(to.x - o.center.x) < o.halfExtents.x && Math.abs(to.z - o.center.z) < o.halfExtents.z && o.center.y + o.halfExtents.y <= to.y + 0.05)) overVoid++;
      for (const o of blocks) {
        expect(capsuleClearance(to, o), `from ${JSON.stringify(from)} facing ${facing}`).toBeGreaterThanOrEqual(-0.005);
      }
    }
    expect(moved).toBeGreaterThan(500);
    expect(overVoid).toBeGreaterThan(0); // вибірка справді вилітає за край над прірвою
    expect(platformsHit.size).toBeGreaterThan(platforms.length * 0.8); // і побувала майже на всіх блоках
    world.free();
  });

  it('a Blink at the cauldron stops in front of it', async () => {
    const { world } = await createWorld();
    buildLevel(world, HONEYCOMBS);
    const s = HONEYCOMBS.source!.position;
    const from = { x: s.x - 5, y: s.y, z: s.z };
    const to = resolveBlink(world, from, Math.PI / 2, TUNING); // на схід, прямо в казан
    expect(to).not.toBeNull();
    expect(to!.x).toBeLessThan(s.x - TUNING.source.halfWidth);
    world.free();
  });
});
