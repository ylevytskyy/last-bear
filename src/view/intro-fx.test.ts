import { describe, expect, it } from 'vitest';
import { introBlend } from './intro-fx';

describe('introBlend', () => {
  it('goes from the girl (0) to Sofiyka (1) over the intro and never back', () => {
    expect(introBlend(0, 2)).toBe(0);
    expect(introBlend(2, 2)).toBe(1);
    expect(introBlend(9, 2)).toBe(1);
    let prev = -1;
    for (let t = 0; t <= 2.2; t += 0.05) {
      expect(introBlend(t, 2)).toBeGreaterThanOrEqual(prev);
      prev = introBlend(t, 2);
    }
  });
});
