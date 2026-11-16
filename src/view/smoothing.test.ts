import { describe, expect, it } from 'vitest';
import { lerpAngle, lerpVec3 } from './smoothing';

describe('smoothing between rule steps', () => {
  it('lerpVec3 blends positions by alpha', () => {
    expect(lerpVec3({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: -2 }, 0.25)).toEqual({ x: 0.5, y: 1, z: -0.5 });
    expect(lerpVec3({ x: 1, y: 1, z: 1 }, { x: 3, y: 3, z: 3 }, 0)).toEqual({ x: 1, y: 1, z: 1 });
    expect(lerpVec3({ x: 1, y: 1, z: 1 }, { x: 3, y: 3, z: 3 }, 1)).toEqual({ x: 3, y: 3, z: 3 });
  });

  it('lerpAngle takes the short way through ±π', () => {
    const a = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(Math.abs(a) - Math.PI)).toBeLessThan(1e-9);
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5, 9);
  });

  it('clamps alpha to 0..1', () => {
    expect(lerpVec3({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 2).x).toBe(1);
    expect(lerpVec3({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, -1).x).toBe(0);
  });
});
