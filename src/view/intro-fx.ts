/** Перетворення в Залаштунках: 0 — силует дівчинки, 1 — Софійка; плавно, з повільним початком і кінцем. */
export function introBlend(t: number, introSeconds: number): number {
  const k = Math.min(1, Math.max(0, t / introSeconds));
  return k * k * (3 - 2 * k);
}
