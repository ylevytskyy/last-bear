/** За скільки фіолетовий туман змінюється теплим світлом, с. */
const FINALE_SECONDS = 3;

/** Фінал: туман 1 → 0, тепле світло 0 → 1 за 3 с від `sliceComplete`. */
export function finaleLight(secondsSinceComplete: number): { fog: number; warm: number } {
  const k = Math.min(1, Math.max(0, secondsSinceComplete / FINALE_SECONDS));
  return { fog: 1 - k, warm: k };
}

/** «Далі буде» з'являється, коли світло вже тепле. */
export function showToBeContinued(secondsSinceComplete: number): boolean {
  return secondsSinceComplete >= FINALE_SECONDS;
}
