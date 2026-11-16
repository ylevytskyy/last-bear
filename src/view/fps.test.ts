import { describe, expect, it } from 'vitest';
import { fpsMeter } from './fps';

describe('fpsMeter', () => {
  it('reads 60 for 16.67 ms frames and 40 for 25 ms frames', () => {
    const a = fpsMeter();
    for (let t = 0; t <= 2000; t += 1000 / 60) a.tick(t);
    expect(a.fps()).toBeGreaterThanOrEqual(59);
    expect(a.fps()).toBeLessThanOrEqual(61);
    const b = fpsMeter();
    for (let t = 0; t <= 2000; t += 25) b.tick(t);
    expect(b.fps()).toBeGreaterThanOrEqual(39);
    expect(b.fps()).toBeLessThanOrEqual(41);
  });

  it('reads 0 before any frame', () => {
    expect(fpsMeter().fps()).toBe(0);
  });
});
