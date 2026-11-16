import type { Level } from '../sim/level';
import data from './playground.level.json';

/**
 * Майданчик для пробування руху: підлога, сходинки, стіна, ґрати, край із прірвою й острів за нею (для Blink).
 * Дві Бджоли й Черепаха — на рівній підлозі, далеко від прірви.
 * Редагується в Blender: `levels/playground.blend`, далі `pnpm levels playground`.
 */
export const PLAYGROUND = data as Level;
