import type RAPIER from '@dimforge/rapier3d-compat';
import { findFreeArrival } from './blink';
import type { Vec3 } from './level';
import { isSafeSpot } from './safe-ground';
import type { EnemyState } from './sim';
import type { Tuning } from './tuning';

/** Найменша частка `reflexBehindDistance`, на яку місце має бути за ворогом. */
const MIN_BEHIND_SHARE = 0.5;

/**
 * Місце Рефлексу: на горизонтальній прямій «Софійка → ворог», за ворогом на `reflexBehindDistance`,
 * на висоті підошов Софійки. Для Бджоли, що висить, — за її проєкцією на площину Софійки.
 * Вільне від геометрії і з надійною землею, інакше `null`.
 */
export function resolveReflex(
  world: RAPIER.World,
  rayDown: (from: Vec3, max: number) => number,
  enemy: EnemyState,
  sofiyka: Vec3,
  tuning: Tuning,
  facing = 0,
): Vec3 | null {
  const dx = enemy.position.x - sofiyka.x;
  const dz = enemy.position.z - sofiyka.z;
  const dist = Math.hypot(dx, dz);
  // Ворог просто над нею: «за ним» — у напрямку її погляду.
  const dir = dist > 1e-3 ? { x: dx / dist, z: dz / dist } : { x: Math.sin(facing), z: Math.cos(facing) };
  const behind = tuning.reflexBehindDistance;
  const to = findFreeArrival(world, sofiyka, dir, dist + behind, dist + behind * MIN_BEHIND_SHARE, tuning);
  if (to === null || !isSafeSpot(rayDown, to)) return null;
  return to;
}
