/** Що робить Софійка, за даними правил і часом у поточному стані (для вибору кліпу анімації). */
export type SofiaMotion = {
  grounded: boolean;
  running: boolean;
  /** Скільки секунд вона в повітрі (0, поки стоїть на землі). */
  airSeconds: number;
  /** Скільки секунд минуло від приземлення (велике, якщо давно). */
  landedAgo: number;
  /** Скільки секунд лишилось грати відмикання Клітки Ключем. */
  unlockLeft: number;
};

/** Скільки триває Jump_Start, с: далі в повітрі грає Jump_Air. */
export const JUMP_START_SECONDS = 0.25;
/** Скільки триває Land, с. */
export const LAND_SECONDS = 0.3;

/** Назва кліпу з `sofia.glb`. */
export function sofiaClip(m: SofiaMotion): string {
  if (!m.grounded) return m.airSeconds < JUMP_START_SECONDS ? 'Jump_Start' : 'Jump_Air';
  if (m.unlockLeft > 0) return 'Unlock_Cage';
  if (m.landedAgo < LAND_SECONDS) return 'Land';
  return m.running ? 'Run' : 'Idle';
}
