/**
 * Непрозорість заливки кольором пелюсток під час переходу через Квітку: 0 → 1 за першу половину
 * (наїзд у бутон), 1 → 0 за другу (уже новий світ). `elapsed` — ігрові секунди від `worldLeft`.
 */
export function transitionFill(elapsed: number, transitionSeconds: number): number {
  if (!(elapsed > 0 && elapsed < transitionSeconds)) return 0;
  const half = transitionSeconds / 2;
  return elapsed <= half ? elapsed / half : (transitionSeconds - elapsed) / half;
}

/** Наскільки камера наїхала в бутон, 0..1: лише в першій половині переходу; у новому світі — 0. */
export function transitionDolly(elapsed: number, transitionSeconds: number): number {
  const half = transitionSeconds / 2;
  if (!(elapsed > 0 && elapsed < half)) return 0;
  return elapsed / half;
}
