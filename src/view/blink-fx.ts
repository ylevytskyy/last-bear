import type { Vec3 } from '../sim/level';

export type BlinkPose = { scale: Vec3; redFlash: boolean; aberration: number };

/** Скільки триває витягнута червона поза, с. */
const STRETCH_SECONDS = 0.05;
/** За скільки секунд зникає розшарування країв, с. */
const ABERRATION_SECONDS = 0.15;

const NORMAL: Vec3 = { x: 1, y: 1, z: 1 };

/** Вигляд Софійки й країв екрана через `secondsSinceBlink` після Blink. */
export function blinkPose(secondsSinceBlink: number): BlinkPose {
  const aberration = Math.max(0, 1 - secondsSinceBlink / ABERRATION_SECONDS);
  if (secondsSinceBlink < STRETCH_SECONDS) {
    return { scale: { x: 0.2, y: 0.2, z: 2.5 }, redFlash: true, aberration };
  }
  return { scale: { ...NORMAL }, redFlash: false, aberration };
}
