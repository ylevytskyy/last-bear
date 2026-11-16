import type { Tuning } from '../sim/tuning';

/** Яскравість очей за перезарядкою Blink: повна при готовності, тьмяна одразу після, між ними лінійно. */
export function eyeIntensity(blinkCooldown: number, tuning: Tuning): number {
  const left = Math.min(1, Math.max(0, blinkCooldown / tuning.blinkCooldown));
  return tuning.eyeGlowReady + (tuning.eyeGlowSpent - tuning.eyeGlowReady) * left;
}
