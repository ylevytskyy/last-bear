import type { Block, Level } from '../sim/level';

const solid = (x: number, y: number, z: number, hx: number, hy: number, hz: number): Block => ({
  kind: 'solid',
  center: { x, y, z },
  halfExtents: { x: hx, y: hy, z: hz },
});
const bars = (x: number, y: number, z: number, hx: number, hy: number, hz: number): Block => ({
  kind: 'bars',
  center: { x, y, z },
  halfExtents: { x: hx, y: hy, z: hz },
});

/**
 * Майданчик для пробування руху: підлога, сходинки, стіна, ґрати, край із прірвою й острів за нею.
 * Дві Бджоли й Черепаха — на рівній підлозі, далеко від прірви.
 */
export const PLAYGROUND: Level = {
  spawn: { x: 0, y: 0, z: -10 },
  killY: -12,
  blocks: [
    solid(0, -0.5, 0, 15, 0.5, 15), // підлога
    solid(-10, 0.25, -4, 2, 0.25, 1), // сходинки
    solid(-10, 0.5, -2, 2, 0.5, 1),
    solid(-10, 0.75, 0, 2, 0.75, 1),
    solid(-4, 1.5, 6, 3, 1.5, 0.5), // суцільна стіна
    bars(3.5, 1.5, 6, 3.5, 1.5, 0.15), // ґрати
    solid(0, -0.5, 25, 6, 0.5, 6), // острів за прірвою (для Blink)
  ],
  enemies: [
    { id: 'bee-1', kind: 'bee', position: { x: 6, y: 1.5, z: -2 }, facing: Math.PI },
    { id: 'bee-2', kind: 'bee', position: { x: -6, y: 1.5, z: 1 }, facing: Math.PI },
    { id: 'turtle-1', kind: 'turtle', position: { x: 7, y: 0, z: -7 }, facing: -Math.PI / 2 },
  ],
};
