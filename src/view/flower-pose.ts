/** Кут пелюстки від вертикалі: бутон — пелюстки зведені догори, розкрита — розходяться назовні, рад. */
const BUD = 0.15;
const OPEN = 1.35;
/** Скільки радіє Полонений після відкриття Клітки, с, і скільки підскоків за цей час. */
const HOP_SECONDS = 1.2;
const HOPS = 3;
/** Висота підскоку, м. */
const HOP_HEIGHT = 0.35;

export function petalAngle(openness: number): number {
  const k = Math.min(1, Math.max(0, openness));
  return BUD + (OPEN - BUD) * k;
}

/** Висота підскоку Полоненого через `seconds` після відкриття Клітки: три підскоки за 1.2 с. */
export function happyHop(seconds: number): number {
  if (!(seconds > 0 && seconds < HOP_SECONDS)) return 0;
  return HOP_HEIGHT * Math.abs(Math.sin((Math.PI * HOPS * seconds) / HOP_SECONDS));
}
