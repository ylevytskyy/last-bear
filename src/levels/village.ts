import type { Block, BlockLook, CageSpawn, FlowerSpawn, Level } from '../sim/level';

const solid = (x: number, y: number, z: number, hx: number, hy: number, hz: number, look?: BlockLook): Block => ({
  kind: 'solid',
  center: { x, y, z },
  halfExtents: { x: hx, y: hy, z: hz },
  ...(look ? { look } : {}),
});
const house = (x: number, z: number): Block => solid(x, 1.5, z, 2, 1.5, 2, 'house');

/** Двері на південь (−z): `facing` = π. П'ять Кліток уздовж північного краю з кроком 4 м; справжня — середня. */
const CAGE_Z = 16;
const cages: CageSpawn[] = [-8, -4, 0, 4, 8].map((x, i) => ({
  id: `cage-${i + 1}`,
  position: { x, y: 0, z: CAGE_Z },
  facing: Math.PI,
  working: x === 0,
}));
const REAL_CAGE_FRONT = CAGE_Z - 1; // z площини дверей справжньої Клітки

const flowers: FlowerSpawn[] = [
  { id: 'flower-yellow', position: { x: 14, y: 0, z: 0 }, color: 'yellow', opens: true, to: 'honeycombs' },
  { id: 'flower-pink', position: { x: 14, y: 0, z: 6 }, color: 'pink', opens: false },
  { id: 'flower-blue', position: { x: 14, y: 0, z: -6 }, color: 'blue', opens: false },
];

/**
 * Селище: рівна площа 40×40 м без прірви, стіни по боках. Вцілілий і старт — на півдні, п'ять Кліток
 * (одна справжня) на півночі, три Квітки на сході, Черепаха й дві Бджоли на заході, осторонь обох Доріжок.
 */
export const VILLAGE: Level = {
  spawn: { x: 0, y: 0, z: -14 },
  killY: -10,
  blocks: [
    solid(0, -0.5, 0, 20, 0.5, 20), // площа
    solid(0, 1.5, 20.25, 20.5, 1.5, 0.25), // стіни
    solid(0, 1.5, -20.25, 20.5, 1.5, 0.25),
    solid(20.25, 1.5, 0, 0.25, 1.5, 20),
    solid(-20.25, 1.5, 0, 0.25, 1.5, 20),
    house(-8, -9),
    house(-16, -15),
    house(16, 12),
    house(-16, 13),
  ],
  entries: {
    backrooms: { x: 0, y: 0, z: -14 }, // як старт: біля Вцілілого
    honeycombs: { x: 11, y: 0, z: 0 }, // у кінці Доріжки до жовтої Квітки
  },
  cages,
  flowers,
  survivor: { position: { x: 2, y: 0, z: -13.5 }, facing: Math.PI }, // обличчям до камери на старті: ліхтар видно
  trail: {
    flower: [
      { x: 1, y: 0, z: -12 },
      { x: 7, y: 0, z: -6 },
      { x: 11, y: 0, z: 0 },
    ],
    cage: [
      { x: 1, y: 0, z: -12 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: REAL_CAGE_FRONT - 2.5 },
    ],
  },
  enemies: [
    { id: 'turtle', kind: 'turtle', position: { x: -10, y: 0, z: 0 }, facing: Math.PI / 2 },
    { id: 'bee-north', kind: 'bee', position: { x: -12, y: 1.5, z: 5 }, facing: Math.PI / 2 },
    { id: 'bee-south', kind: 'bee', position: { x: -12, y: 1.5, z: -5 }, facing: Math.PI / 2 },
  ],
};
