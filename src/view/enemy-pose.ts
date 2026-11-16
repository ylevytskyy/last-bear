import type { BeeState, TurtleState } from '../sim/sim';
import { TUNING, type Tuning } from '../sim/tuning';

export type EnemyPose = {
  /** Тремтіння, м (амплітуда зсуву моделі). */
  shake: number;
  /** Почервоніння тіла, 0..1. */
  tint: number;
  /** Світіння Колби Черепахи (для Бджоли 0). */
  flaskGlow: number;
  /** Швидкість крил Бджоли, обертів за кадр-секунду у відносних одиницях (0 — крила стоять). */
  wingSpeed: number;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Вигляд ворога за станом правил і часом у ньому: довгий видимий замах. */
export function enemyPose(state: BeeState | TurtleState, kind: 'bee' | 'turtle', stateTime: number, tuning: Tuning = TUNING): EnemyPose {
  if (kind === 'bee') {
    switch (state) {
      case 'WINDUP': {
        const k = clamp01(stateTime / tuning.bee.windupSeconds);
        return { shake: 0.02 + 0.08 * k, tint: 0.2 + 0.8 * k, flaskGlow: 0, wingSpeed: 1.6 };
      }
      case 'DASH':
        return { shake: 0, tint: 1, flaskGlow: 0, wingSpeed: 2 };
      case 'STUCK':
        return { shake: 0, tint: 0, flaskGlow: 0, wingSpeed: 0 };
      case 'RECOVER':
        return { shake: 0, tint: 0, flaskGlow: 0, wingSpeed: 0.7 };
      default:
        return { shake: 0, tint: 0, flaskGlow: 0, wingSpeed: 1 };
    }
  }
  switch (state) {
    case 'WINDUP': {
      const k = clamp01(stateTime / tuning.turtle.windupSeconds);
      return { shake: 0.01 + 0.03 * k, tint: 0.5 * k, flaskGlow: 0.6 + 2.4 * k, wingSpeed: 0 };
    }
    case 'SPIN':
      return { shake: 0, tint: 0.5, flaskGlow: 3, wingSpeed: 0 };
    case 'COOLDOWN':
      return { shake: 0, tint: 0, flaskGlow: 0.3, wingSpeed: 0 };
    default:
      return { shake: 0, tint: 0, flaskGlow: 0.6, wingSpeed: 0 };
  }
}
