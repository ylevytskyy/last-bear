import RAPIER from '@dimforge/rapier3d-compat';
import type { Vec3 } from './level';
import type { Tuning } from './tuning';
import { ALL_GROUPS, BARS_GROUP, SOLID_GROUP, groups } from './world';

/** Капсулу піднімаємо над підлогою, щоб дотик до неї не лічився зіткненням. */
const LIFT = 0.02;
/** Запас між капсулою і блоком у місці прибуття, м. */
const SKIN = 0.01;
/** Крок відступу, якщо місце прибуття зайняте, м. */
const BACKOFF = 0.05;

/**
 * Перше вільне місце для капсули з `from` (підошви) уздовж горизонтального напрямку `dir`
 * (одиничного): суцільний блок зупиняє політ, ґрати — ні; зайняте місце — відступ назад.
 * `null`, якщо вільного місця не ближче за `minDistance` немає.
 */
export function findFreeArrival(
  world: RAPIER.World,
  from: Vec3,
  dir: { x: number; z: number },
  maxDistance: number,
  minDistance: number,
  tuning: Tuning,
): Vec3 | null {
  const r = tuning.capsuleRadius;
  const shape = new RAPIER.Capsule((tuning.capsuleHeight - 2 * r) / 2, r + SKIN);
  const rot = { x: 0, y: 0, z: 0, w: 1 };
  const centerY = from.y + tuning.capsuleHeight / 2 + LIFT;
  const at = (t: number) => ({ x: from.x + dir.x * t, y: centerY, z: from.z + dir.z * t });

  const wall = world.castShape(
    at(0),
    rot,
    { x: dir.x, y: 0, z: dir.z },
    shape,
    0,
    maxDistance,
    false,
    undefined,
    groups(0xffff, SOLID_GROUP),
  );
  let t = wall ? wall.time_of_impact : maxDistance;

  const occupied = groups(0xffff, ALL_GROUPS & (SOLID_GROUP | BARS_GROUP));
  while (t >= minDistance) {
    if (world.intersectionWithShape(at(t), rot, shape, undefined, occupied) === null) {
      return { x: from.x + dir.x * t, y: from.y, z: from.z + dir.z * t };
    }
    t -= BACKOFF;
  }
  return null;
}

/**
 * Місце прибуття Blink з `from` (підошви) у напрямку `facing`, або `null`, якщо вільного місця
 * далі за `blinkMinDistance` немає. Суцільний блок зупиняє політ, ґрати — ні.
 */
export function resolveBlink(world: RAPIER.World, from: Vec3, facing: number, tuning: Tuning): Vec3 | null {
  const dir = { x: Math.sin(facing), z: Math.cos(facing) };
  return findFreeArrival(world, from, dir, tuning.blinkDistance, tuning.blinkMinDistance, tuning);
}
