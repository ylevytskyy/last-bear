import { describe, expect, it } from 'vitest';
import { blinkPose } from './blink-fx';

describe('blinkPose', () => {
  it('stretches and flashes red in the first 0.05 s', () => {
    const p = blinkPose(0.02);
    expect(p.scale).toEqual({ x: 0.2, y: 0.2, z: 2.5 });
    expect(p.redFlash).toBe(true);
  });

  it('is back to normal shape at 0.1 s while the edge split is still fading', () => {
    const p = blinkPose(0.1);
    expect(p.scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(p.redFlash).toBe(false);
    expect(p.aberration).toBeGreaterThan(0);
    expect(p.aberration).toBeLessThan(1);
  });

  it('has no edge split at 0.2 s or later, and starts at full strength', () => {
    expect(blinkPose(0.2).aberration).toBe(0);
    expect(blinkPose(5).aberration).toBe(0);
    expect(blinkPose(0).aberration).toBe(1);
  });

  it('is neutral when there has been no Blink', () => {
    const p = blinkPose(Infinity);
    expect(p.scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(p.redFlash).toBe(false);
    expect(p.aberration).toBe(0);
  });
});
