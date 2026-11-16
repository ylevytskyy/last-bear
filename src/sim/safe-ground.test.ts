import { describe, expect, it } from 'vitest';
import { isSafeSpot } from './safe-ground';

/** Земля: x від -3 до 3, висота 0, нижче лише порожнеча. */
const rayDown = (from: { x: number; y: number; z: number }, max: number): number => {
  const onGround = Math.abs(from.x) <= 3 && Math.abs(from.z) <= 3;
  const d = from.y; // до землі на висоті 0
  return onGround && d <= max ? d : max;
};

describe('isSafeSpot', () => {
  it('is safe in the middle of the ground', () => {
    expect(isSafeSpot(rayDown, { x: 0, y: 0, z: 0 })).toBe(true);
  });
  it('is not safe less than half a metre from an edge, in any direction', () => {
    for (const [x, z] of [[2.7, 0], [-2.7, 0], [0, 2.7], [0, -2.7]] as const) {
      expect(isSafeSpot(rayDown, { x, y: 0, z })).toBe(false);
    }
  });
  it('is safe half a metre or more from the edge', () => {
    expect(isSafeSpot(rayDown, { x: 2.4, y: 0, z: 0 })).toBe(true);
  });
});
