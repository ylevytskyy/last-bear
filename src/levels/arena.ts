import type { Block, Level } from '../sim/level';

const solid = (x: number, y: number, z: number, hx: number, hy: number, hz: number): Block => ({
  kind: 'solid',
  center: { x, y, z },
  halfExtents: { x: hx, y: hy, z: hz },
});

/** Плоска арена 30×30 м зі стінами по боках, без прірви: дві Бджоли й Черепаха. */
export const ARENA: Level = {
  spawn: { x: 0, y: 0, z: -3 }, // ближче, ніж у плані (−10): звідти жоден ворог її не помічає
  killY: -10,
  blocks: [
    solid(0, -0.5, 0, 15, 0.5, 15), // підлога
    solid(0, 1.5, 15.25, 15.5, 1.5, 0.25), // стіни
    solid(0, 1.5, -15.25, 15.5, 1.5, 0.25),
    solid(15.25, 1.5, 0, 0.25, 1.5, 15),
    solid(-15.25, 1.5, 0, 0.25, 1.5, 15),
  ],
  enemies: [
    { id: 'turtle', kind: 'turtle', position: { x: 0, y: 0, z: 4 }, facing: Math.PI },
    { id: 'bee-left', kind: 'bee', position: { x: -5, y: 1.5, z: 3 }, facing: Math.PI },
    { id: 'bee-right', kind: 'bee', position: { x: 5, y: 1.5, z: 3 }, facing: Math.PI },
  ],
};
