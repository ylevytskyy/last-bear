import type { Level, Vec3 } from './level';
import type { CageState } from './sim';

/** Куди йти: за Ключем, до Клітки з Ключем або нікуди — Полоненого звільнено. */
export type Progress = 'needKey' | 'haveKey' | 'freed';

/** `freed`, коли справжня Клітка відкрита; інакше `haveKey` при Ключі в руках; інакше `needKey`. */
export function progressOf(keys: number, cages: readonly CageState[]): Progress {
  if (cages.some((c) => c.working && c.open)) return 'freed';
  return keys >= 1 ? 'haveKey' : 'needKey';
}

/** Ламана Доріжки: до жовтої Квітки, до справжньої Клітки або порожня. */
export function trailPath(progress: Progress, trail: NonNullable<Level['trail']>): Vec3[] {
  if (progress === 'needKey') return trail.flower;
  if (progress === 'haveKey') return trail.cage;
  return [];
}
