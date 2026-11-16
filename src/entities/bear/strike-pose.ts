/** Частка Удару, що йде на замах назад. */
const WINDUP_SHARE = 0.3;
/** Наскільки лапа йде назад і вперед, рад. */
const BACK = 0.9;
const FORWARD = 1.6;

/**
 * Права лапа під час Удару: спершу замах назад (від'ємне), далі удар уперед (додатне) і повернення.
 * На краях Удару — 0.
 */
export function strikePose(secondsInStrike: number, strikeSeconds: number): { armSwing: number } {
  const k = secondsInStrike / strikeSeconds;
  if (!(k > 0 && k < 1)) return { armSwing: 0 };
  if (k < WINDUP_SHARE) return { armSwing: -Math.sin((Math.PI * k) / WINDUP_SHARE) * BACK };
  return { armSwing: Math.sin((Math.PI * (k - WINDUP_SHARE)) / (1 - WINDUP_SHARE)) * FORWARD };
}
