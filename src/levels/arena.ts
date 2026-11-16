import type { Level } from '../sim/level';
import data from './arena.level.json';

/**
 * Плоска арена 30×30 м зі стінами по боках, без прірви: дві Бджоли й Черепаха.
 * Старт ближче, ніж у плані (z = −3, не −10): звідти жоден ворог її не помічає.
 * Редагується в Blender: `levels/arena.blend`, далі `pnpm levels arena`.
 */
export const ARENA = data as Level;
