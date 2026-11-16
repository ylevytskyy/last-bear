import { describe, expect, it } from 'vitest';
import { slowdownFx } from './slowdown-fx';

describe('slowdownFx', () => {
  it('is all zero when the Window is closed', () => {
    expect(slowdownFx(false, 0, 1.2)).toEqual({ tint: 0, vignette: 0, hintScale: 0 });
    expect(slowdownFx(false, 1, 1.2)).toEqual({ tint: 0, vignette: 0, hintScale: 0 });
  });

  it('cools the picture while open, and the Shift hint grows as time runs out', () => {
    const fresh = slowdownFx(true, 1.2, 1.2);
    const late = slowdownFx(true, 0.2, 1.2);
    expect(fresh.tint).toBeGreaterThan(0);
    expect(late.tint).toBeGreaterThan(0);
    expect(fresh.vignette).toBeGreaterThan(0);
    expect(fresh.hintScale).toBeGreaterThan(0);
    expect(late.hintScale).toBeGreaterThan(fresh.hintScale);
  });
});
