import type { Vec3 } from './level';

/**
 * Де рухома платформа в мить `time` (с): ходить від `from` до `to` і назад з постійною швидкістю `speed` (м/с),
 * на кінцях розвертається (трикутна хвиля). Якщо точки збігаються — стоїть.
 */
export function moverPosition(from: Vec3, to: Vec3, time: number, speed: number): Vec3 {
  const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  if (length < 1e-12) return { ...from };
  const phase = (((time * speed) % (2 * length)) + 2 * length) % (2 * length);
  const along = (phase <= length ? phase : 2 * length - phase) / length;
  return { x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along, z: from.z + (to.z - from.z) * along };
}
