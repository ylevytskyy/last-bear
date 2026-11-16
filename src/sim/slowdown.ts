import type { Vec3 } from './level';
import type { EnemyState, SlowdownState } from './sim';
import type { Tuning } from './tuning';

/** Найбільша різниця висот між ворогом і підошвами Софійки, щоб Сенсор його помітив, м. */
const SENSOR_HEIGHT = 2.5;

/**
 * Облік Вікон. Ключ атаки — `id#лічильник`; лічильник росте на кожному передньому фронті `attacking`.
 * `spentFor` — атаки, для яких Вікно вже було.
 */
export type SlowdownBook = {
  slowdown: SlowdownState;
  spentFor: ReadonlySet<string>;
  attackCount: ReadonlyMap<string, number>;
  wasAttacking: ReadonlySet<string>;
};

export function createSlowdownBook(): SlowdownBook {
  return { slowdown: { open: false, remaining: 0, enemyId: null }, spentFor: new Set(), attackCount: new Map(), wasAttacking: new Set() };
}

/** Закриває Вікно (Рефлекс). Атака лишається витраченою. */
export function closeSlowdown(book: SlowdownBook): SlowdownBook {
  return { ...book, slowdown: { open: false, remaining: 0, enemyId: null } };
}

/**
 * Один крок правил (`stepSeconds` ігрового часу). Відкрите Вікно спливає в реальних секундах:
 * `remaining -= stepSeconds / slowdownTimeScale`. `canOpen` = false, поки Софійка невразлива.
 */
export function stepSlowdown(
  book: SlowdownBook,
  enemies: readonly EnemyState[],
  sofiyka: Vec3,
  stepSeconds: number,
  canOpen: boolean,
  tuning: Tuning,
): { book: SlowdownBook; opened: string | null; expired: boolean } {
  const attackCount = new Map(book.attackCount);
  const wasAttacking = new Set<string>();
  for (const e of enemies) {
    if (!e.attacking) continue;
    wasAttacking.add(e.id);
    if (!book.wasAttacking.has(e.id)) attackCount.set(e.id, (attackCount.get(e.id) ?? 0) + 1);
  }

  let slowdown = book.slowdown;
  let expired = false;
  if (slowdown.open) {
    const remaining = slowdown.remaining - stepSeconds / tuning.slowdownTimeScale;
    if (remaining <= 1e-9) {
      slowdown = { open: false, remaining: 0, enemyId: null };
      expired = true;
    } else {
      slowdown = { ...slowdown, remaining };
    }
  }

  let opened: string | null = null;
  let spentFor = book.spentFor;
  if (!slowdown.open && !expired && canOpen) {
    for (const e of enemies) {
      if (!e.attacking) continue;
      const key = `${e.id}#${attackCount.get(e.id) ?? 0}`;
      if (spentFor.has(key)) continue;
      const near = Math.hypot(e.position.x - sofiyka.x, e.position.z - sofiyka.z) < tuning.sensorRadius;
      const level = Math.abs(e.position.y - sofiyka.y) <= SENSOR_HEIGHT;
      if (!near || !level) continue;
      spentFor = new Set(spentFor).add(key);
      slowdown = { open: true, remaining: tuning.slowdownSeconds, enemyId: e.id };
      opened = e.id;
      break;
    }
  }
  return { book: { slowdown, spentFor, attackCount, wasAttacking }, opened, expired };
}
