import type { Vec3 } from './level';

/** Звідки пускаємо промені: на стільки вище підошов, м. */
const ORIGIN_LIFT = 0.2;
/** Земля має бути не глибше за стільки під підошвами, м. */
const GROUND_DEPTH = 0.3;
/** Відступ від краю, м. */
const EDGE_MARGIN = 0.5;

/**
 * Надійне місце: земля є під підошвами і на `EDGE_MARGIN` по x та z від них, тож це не край.
 * `rayDown(from, max)` — відстань униз до суцільної землі, `max`, якщо землі немає.
 */
export function isSafeSpot(rayDown: (from: Vec3, max: number) => number, soles: Vec3): boolean {
  const reach = ORIGIN_LIFT + GROUND_DEPTH;
  const offsets: [number, number][] = [[0, 0], [EDGE_MARGIN, 0], [-EDGE_MARGIN, 0], [0, EDGE_MARGIN], [0, -EDGE_MARGIN]];
  return offsets.every(([dx, dz]) => rayDown({ x: soles.x + dx, y: soles.y + ORIGIN_LIFT, z: soles.z + dz }, reach) < reach);
}
