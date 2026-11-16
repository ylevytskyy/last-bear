import RAPIER from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';
import type { Block, Level, Vec3 } from './level';
import { resolveReflex } from './reflex';
import type { EnemyState } from './sim';
import { TUNING } from './tuning';
import { SOLID_GROUP, buildLevel, createWorld, groups } from './world';

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
  return Math.hypot(dx, dy, dz) - r;
}
/** Під точкою є плитка підлоги (верх на y = 0), без Rapier. */
const onTile = (p: { x: number; z: number }, tiles: Block[]) =>
  tiles.some((t) => Math.abs(p.x - t.center.x) <= t.halfExtents.x && Math.abs(p.z - t.center.z) <= t.halfExtents.z);

describe('Reflex never ends inside geometry or over the abyss', () => {
  it('holds for 1000 random cases', async () => {
    const rand = rng(20261116);
    const between = (lo: number, hi: number) => lo + (hi - lo) * rand();
    // Підлога з плиток 6×6 м, частини бракує — там прірва.
    const tiles: Block[] = [];
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        if ((i !== 0 || j !== 0) && rand() < 0.3) continue;
        tiles.push({ kind: 'solid', center: { x: i * 6, y: -0.5, z: j * 6 }, halfExtents: { x: 3, y: 0.5, z: 3 } });
      }
    }
    const walls: Block[] = [];
    for (let i = 0; i < 10; i++) {
      walls.push({
        kind: rand() < 0.5 ? 'solid' : 'bars',
        center: { x: between(-14, 14), y: 1, z: between(-14, 14) },
        halfExtents: { x: between(0.3, 1.5), y: 1, z: between(0.3, 1.5) },
      });
    }
    const level: Level = { blocks: [...tiles, ...walls], spawn: { x: 0, y: 0, z: 0 }, killY: -20 };
    const { world } = await createWorld();
    buildLevel(world, level);
    const rayDown = (from: Vec3, max: number) => {
      const hit = world.castRay(new RAPIER.Ray(from, { x: 0, y: -1, z: 0 }), max, true, undefined, groups(0xffff, SOLID_GROUP));
      return hit ? hit.timeOfImpact : max;
    };

    let moved = 0;
    let checked = 0;
    while (checked < 1000) {
      const her = { x: between(-14, 14), y: 0, z: between(-14, 14) };
      if (!onTile(her, tiles) || walls.some((b) => capsuleClearance(her, b) < 0.02)) continue;
      checked++;
      const angle = between(-Math.PI, Math.PI);
      const dist = between(0.8, 3.4);
      const kind = rand() < 0.5 ? 'bee' : 'turtle';
      const enemy: EnemyState = {
        id: 'e',
        kind,
        position: { x: her.x + Math.sin(angle) * dist, y: kind === 'bee' ? between(0.5, 2) : 0, z: her.z + Math.cos(angle) * dist },
        facing: 0,
        state: 'WINDUP',
        stateTime: 0,
        attacking: true,
        vulnerable: false,
        hp: 1,
      };
      const to = resolveReflex(world, rayDown, enemy, her, TUNING);
      if (to === null) continue;
      moved++;
      const where = `her ${JSON.stringify(her)} enemy ${JSON.stringify(enemy.position)}`;
      for (const b of walls) expect(capsuleClearance(to, b), where).toBeGreaterThanOrEqual(-0.005);
      expect(to.y, where).toBe(her.y);
      expect(onTile(to, tiles), where).toBe(true);
      // За ворогом: далі від Софійки, ніж ворог, на тій самій прямій.
      const along = (to.x - her.x) * Math.sin(angle) + (to.z - her.z) * Math.cos(angle);
      expect(along, where).toBeGreaterThan(dist);
    }
    expect(moved).toBeGreaterThan(300);
    world.free();
  });
});
