import type { Vec3 } from './level';
import type { EnemyState } from './sim';
import type { Tuning } from './tuning';

/** Висота грудей над підошвами — центр хітбоксу Удару, м. */
const CHEST_HEIGHT = 0.9;
/** Центр тіла Черепахи над підошвами, м. */
const TURTLE_BODY_HEIGHT = 0.5;

/** Центр хітбоксу Удару: на `strikeReach` попереду Софійки на висоті грудей. */
export function strikeCenter(sofiyka: { position: Vec3; facing: number }, tuning: Tuning): Vec3 {
  return {
    x: sofiyka.position.x + Math.sin(sofiyka.facing) * tuning.strikeReach,
    y: sofiyka.position.y + CHEST_HEIGHT,
    z: sofiyka.position.z + Math.cos(sofiyka.facing) * tuning.strikeReach,
  };
}

/**
 * Чи влучає Удар. Хітбокс — куля `strikeRadius` на `strikeReach` попереду на висоті грудей;
 * ворог усередині, якщо його тіло (куля власного радіуса) торкається хітбоксу.
 * `blocked` — усередині, але невразливий: Бджола не застрягла, або Колба Черепахи не до Софійки.
 */
export function strikeHits(
  sofiyka: { position: Vec3; facing: number },
  enemy: EnemyState,
  tuning: Tuning,
): 'hit' | 'blocked' | 'miss' {
  const c = strikeCenter(sofiyka, tuning);
  const body = enemy.kind === 'bee' ? enemy.position : { ...enemy.position, y: enemy.position.y + TURTLE_BODY_HEIGHT };
  const radius = enemy.kind === 'bee' ? tuning.bee.radius : tuning.turtle.radius;
  const d = Math.hypot(body.x - c.x, body.y - c.y, body.z - c.z);
  if (d >= tuning.strikeRadius + radius) return 'miss';
  if (enemy.kind === 'bee') return enemy.state === 'STUCK' ? 'hit' : 'blocked';
  const flask = enemy.facing + Math.PI;
  const toHer = Math.atan2(sofiyka.position.x - enemy.position.x, sofiyka.position.z - enemy.position.z);
  const gap = Math.abs(Math.atan2(Math.sin(toHer - flask), Math.cos(toHer - flask)));
  return gap <= (tuning.flaskArcDegrees * Math.PI) / 180 + 1e-9 ? 'hit' : 'blocked';
}
