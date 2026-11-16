import { describe, expect, it } from 'vitest';
import { finaleLight, showToBeContinued } from './finale-fx';

describe('finaleLight', () => {
  it('turns the purple fog into warm light over 3 s, monotonically', () => {
    expect(finaleLight(0)).toEqual({ fog: 1, warm: 0 });
    expect(finaleLight(3)).toEqual({ fog: 0, warm: 1 });
    let prev = finaleLight(0);
    for (let t = 0.05; t <= 3.5; t += 0.05) {
      const now = finaleLight(t);
      expect(now.fog).toBeLessThanOrEqual(prev.fog);
      expect(now.warm).toBeGreaterThanOrEqual(prev.warm);
      prev = now;
    }
  });

  it('shows the end card only after 3 s', () => {
    expect(showToBeContinued(2.9)).toBe(false);
    expect(showToBeContinued(3)).toBe(true);
  });
});
