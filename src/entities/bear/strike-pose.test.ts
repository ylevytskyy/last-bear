import { describe, expect, it } from 'vitest';
import { strikePose } from './strike-pose';

describe('strikePose', () => {
  it('is at rest at the start and the end of the strike', () => {
    expect(strikePose(0, 0.35).armSwing).toBe(0);
    expect(strikePose(0.35, 0.35).armSwing).toBe(0);
    expect(strikePose(1, 0.35).armSwing).toBe(0);
  });

  it('swings back, then forward through the middle', () => {
    expect(strikePose(0.15, 0.35).armSwing).not.toBe(0);
    expect(strikePose(0.04, 0.35).armSwing).toBeLessThan(0); // замах назад
    expect(strikePose(0.2, 0.35).armSwing).toBeGreaterThan(0); // удар уперед
  });
});
