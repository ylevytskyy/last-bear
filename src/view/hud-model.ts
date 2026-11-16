/** Скільки триває червоний спалах рамки після втрати Серця, с. */
const HURT_FLASH_SECONDS = 0.3;
/** Частота мигання невразливої Софійки, Гц. */
const BLINK_HZ = 8;

/** Ряд Сердець зліва направо: спершу повні, далі порожні; завжди `maxHearts` штук. */
export function heartsLayout(hearts: number, maxHearts: number): ('full' | 'empty')[] {
  const full = Math.max(0, Math.min(maxHearts, hearts));
  return Array.from({ length: maxHearts }, (_, i) => (i < full ? 'full' : 'empty'));
}

/** Невразлива Софійка мигає ≈8 Гц; інакше завжди видима. */
export function blinkVisible(invulnerable: number, timeSeconds: number): boolean {
  if (invulnerable <= 0) return true;
  return Math.floor(timeSeconds * BLINK_HZ * 2) % 2 === 0;
}

/** Сила червоного спалаху рамки через `secondsSinceHurt` після втрати Серця: 1 → 0 за 0.3 с. */
export function hurtFlash(secondsSinceHurt: number): number {
  return Math.max(0, 1 - secondsSinceHurt / HURT_FLASH_SECONDS);
}
