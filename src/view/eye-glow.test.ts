import { describe, expect, it } from 'vitest';
import { TUNING } from '../sim/tuning';
import { eyeIntensity } from './eye-glow';

describe('eyeIntensity', () => {
  it('is full when Blink is ready', () => {
    expect(eyeIntensity(0, TUNING)).toBe(4);
  });

  it('is dim right after a Blink', () => {
    expect(eyeIntensity(2, TUNING)).toBe(0.5);
  });

  it('is strictly between halfway through the cooldown', () => {
    const v = eyeIntensity(1, TUNING);
    expect(v).toBeGreaterThan(0.5);
    expect(v).toBeLessThan(4);
  });

  it('never gets dimmer as the cooldown runs down', () => {
    let last = eyeIntensity(2, TUNING);
    for (let c = 2; c >= 0; c -= 1 / 60) {
      const v = eyeIntensity(Math.max(0, c), TUNING);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it('stays within bounds for out-of-range cooldowns', () => {
    expect(eyeIntensity(-1, TUNING)).toBe(4);
    expect(eyeIntensity(9, TUNING)).toBe(0.5);
  });
});
