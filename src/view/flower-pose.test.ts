import { describe, expect, it } from 'vitest';
import { happyHop, petalAngle } from './flower-pose';

describe('petalAngle', () => {
  it('opens the petals as openness grows', () => {
    expect(petalAngle(0)).toBeLessThan(petalAngle(0.5));
    expect(petalAngle(0.5)).toBeLessThan(petalAngle(1));
  });
});

describe('happyHop', () => {
  it('is zero at rest and after the joy, above zero while hopping', () => {
    expect(happyHop(0)).toBe(0);
    expect(happyHop(0.3)).toBeGreaterThan(0);
    expect(happyHop(1.3)).toBe(0);
    expect(happyHop(-1)).toBe(0);
  });
});
