import type { FlowerSpawn, Vec3 } from './level';
import type { Tuning } from './tuning';

/** Квітка розкрита настільки, що в бутон можна увійти. */
const ENTER_OPENNESS = 0.9;

/**
 * Розкриття Квітки за крок `dt`: 0 — бутон, 1 — розкрита. Квітка з `opens` розкривається, коли Софійка ближче
 * за `flowerOpenRadius` (по xz), і закривається з тією ж швидкістю, коли далі; закриті Квітки — завжди 0.
 */
export function stepFlower(openness: number, opens: boolean, distanceXZ: number, dt: number, tuning: Tuning): number {
  if (!opens) return 0;
  const v = tuning.village;
  const toward = distanceXZ < v.flowerOpenRadius ? 1 : -1;
  return Math.min(1, Math.max(0, openness + (toward * dt) / v.flowerOpenSeconds));
}

/**
 * Чи ввійшла Софійка в бутон на цьому кроці: Квітка розкрита, вона в повітрі, її підошви перетнули висоту бутона
 * згори вниз (`prevSolesY` — до кроку) і вона ближче за `flowerEnterRadius` до центра Квітки по xz.
 */
export function entersFlower(
  prevSolesY: number,
  sofiyka: { position: Vec3; grounded: boolean },
  flower: FlowerSpawn,
  openness: number,
  tuning: Tuning,
): boolean {
  const v = tuning.village;
  if (openness < ENTER_OPENNESS || sofiyka.grounded) return false;
  const budY = flower.position.y + v.flowerBudHeight;
  if (!(prevSolesY >= budY && budY > sofiyka.position.y)) return false;
  return Math.hypot(sofiyka.position.x - flower.position.x, sofiyka.position.z - flower.position.z) < v.flowerEnterRadius;
}
