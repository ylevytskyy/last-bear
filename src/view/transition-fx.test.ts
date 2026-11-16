import { describe, expect, it } from 'vitest';
import { transitionDolly, transitionFill } from './transition-fx';

const T = 1.2;

describe('transitionFill', () => {
  it('fills to full colour by the middle and clears by the end', () => {
    expect(transitionFill(0, T)).toBe(0);
    expect(transitionFill(T / 2, T)).toBeCloseTo(1, 9);
    expect(transitionFill(T, T)).toBeCloseTo(0, 9);
    expect(transitionFill(-1, T)).toBe(0);
    expect(transitionFill(5, T)).toBe(0);
  });

  it('has no jumps: one 1/60 s frame changes it by at most 2/(T·60)', () => {
    for (let t = 0; t < T; t += 1 / 60) {
      expect(Math.abs(transitionFill(t + 1 / 60, T) - transitionFill(t, T))).toBeLessThanOrEqual((2 / (T * 60)) * 1.01);
    }
  });
});

describe('transitionDolly', () => {
  it('moves into the bud over the first half, then is back to 0 in the new world', () => {
    expect(transitionDolly(0, T)).toBe(0);
    expect(transitionDolly(T / 4, T)).toBeGreaterThan(0);
    expect(transitionDolly(T / 2 - 1e-6, T)).toBeCloseTo(1, 4);
    expect(transitionDolly(T / 2 + 0.01, T)).toBe(0);
  });
});
