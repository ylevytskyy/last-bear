import { describe, expect, it } from 'vitest';
import type { SourceSpawn, Vec3 } from './level';
import { keyDropAt, sourceBlock, strikeHitsSource } from './source';
import { TUNING } from './tuning';

const SPAWN: SourceSpawn = { id: 'source', position: { x: 10, y: 2, z: -4 } };
const S = TUNING.source;
const R = TUNING.strikeRadius;
const top = SPAWN.position.y + S.height;

describe('sourceBlock', () => {
  it('is a solid cube of the tuned size standing on the ground under the spawn, looking like a source', () => {
    const b = sourceBlock(SPAWN, TUNING);
    expect(b.kind).toBe('solid');
    expect(b.look).toBe('source');
    expect(b.halfExtents).toEqual({ x: S.halfWidth, y: S.height / 2, z: S.halfWidth });
    expect(b.center).toEqual({ x: 10, y: 2 + S.height / 2, z: -4 });
    expect(b.center.y - b.halfExtents.y).toBeCloseTo(SPAWN.position.y, 9);
  });
});

describe('strikeHitsSource: a ball of strikeRadius against the cube', () => {
  const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
  const hit = (c: Vec3) => strikeHitsSource(c, R, SPAWN, TUNING);

  it('touches from each side at exactly the radius and misses just beyond it', () => {
    const x = SPAWN.position.x;
    const z = SPAWN.position.z;
    const y = SPAWN.position.y + 0.9;
    expect(hit(at(x + S.halfWidth + R - 0.01, y, z))).toBe(true);
    expect(hit(at(x + S.halfWidth + R + 0.01, y, z))).toBe(false);
    expect(hit(at(x - S.halfWidth - R + 0.01, y, z))).toBe(true);
    expect(hit(at(x - S.halfWidth - R - 0.01, y, z))).toBe(false);
    expect(hit(at(x, y, z + S.halfWidth + R - 0.01))).toBe(true);
    expect(hit(at(x, y, z - S.halfWidth - R - 0.01))).toBe(false);
  });

  it('counts the top and the bottom too, and a centre inside the cube', () => {
    const { x, z } = SPAWN.position;
    expect(hit(at(x, top + R - 0.01, z))).toBe(true);
    expect(hit(at(x, top + R + 0.01, z))).toBe(false);
    expect(hit(at(x, SPAWN.position.y - R - 0.01, z))).toBe(false);
    expect(hit(at(x, SPAWN.position.y + 0.5, z))).toBe(true);
  });

  it('measures to the corner in 3D, not to the faces: a ball past the corner by less than the radius on each axis can still miss', () => {
    const { x, z } = SPAWN.position;
    const c = at(x + S.halfWidth + R * 0.8, top + R * 0.8, z + S.halfWidth + R * 0.8); // кожна вісь у межах R, але кутова відстань = 0.8·R·√3 > R
    expect(hit(c)).toBe(false);
    expect(hit(at(x + S.halfWidth + R * 0.5, top + R * 0.5, z + S.halfWidth + R * 0.5))).toBe(true); // 0.5·√3 < 1
  });

  it('uses the radius it is given', () => {
    const { x, z } = SPAWN.position;
    const c = at(x + S.halfWidth + 0.5, SPAWN.position.y + 0.9, z);
    expect(strikeHitsSource(c, 0.4, SPAWN, TUNING)).toBe(false);
    expect(strikeHitsSource(c, 0.6, SPAWN, TUNING)).toBe(true);
  });
});

describe('keyDropAt', () => {
  const horizontal = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
  /** Відстань від центру до стінки куба в напрямку (dx, dz), плюс `keyDropDistance` за стінку. */
  const expected = (dx: number, dz: number) => {
    const len = Math.hypot(dx, dz);
    return S.halfWidth / Math.max(Math.abs(dx / len), Math.abs(dz / len)) + S.keyDropDistance;
  };

  it('puts the key keyDropDistance beyond the cauldron wall, towards her, on the ground the source stands on', () => {
    const she: Vec3 = { x: 10, y: 2, z: -7 };
    const k = keyDropAt(SPAWN, she, TUNING);
    expect(k.x).toBeCloseTo(10, 9);
    expect(k.z).toBeCloseTo(-4 - S.halfWidth - S.keyDropDistance, 9);
    expect(k.y).toBe(SPAWN.position.y);
  });

  it('keeps the distance at an angle, and no matter how far she stands', () => {
    for (const she of [{ x: 13, y: 2, z: -1 }, { x: 4, y: 2, z: -4.5 }, { x: 10.2, y: 2, z: 30 }]) {
      const k = keyDropAt(SPAWN, she, TUNING);
      expect(horizontal(k, SPAWN.position)).toBeCloseTo(expected(she.x - SPAWN.position.x, she.z - SPAWN.position.z), 9);
      const toHer = Math.atan2(she.x - SPAWN.position.x, she.z - SPAWN.position.z);
      const toKey = Math.atan2(k.x - SPAWN.position.x, k.z - SPAWN.position.z);
      expect(Math.abs(Math.atan2(Math.sin(toHer - toKey), Math.cos(toHer - toKey)))).toBeLessThan(1e-9);
    }
  });

  it('lies outside the cube even towards its corner', () => {
    const k = keyDropAt(SPAWN, { x: 20, y: 2, z: 6 }, TUNING);
    const outside = Math.max(Math.abs(k.x - SPAWN.position.x), Math.abs(k.z - SPAWN.position.z)) > S.halfWidth;
    expect(outside).toBe(true);
  });

  it('still gives a point at the right distance when she stands exactly over the centre', () => {
    const k = keyDropAt(SPAWN, { x: 10, y: 5, z: -4 }, TUNING);
    const d = horizontal(k, SPAWN.position);
    expect(d).toBeGreaterThanOrEqual(S.halfWidth + S.keyDropDistance - 1e-9);
    expect(d).toBeLessThanOrEqual(S.halfWidth * Math.SQRT2 + S.keyDropDistance + 1e-9);
  });
});
