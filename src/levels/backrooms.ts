import type { Block, Level, Route, SignSpawn } from '../sim/level';

const block = (kind: Block['kind'], x: number, y: number, z: number, hx: number, hy: number, hz: number): Block => ({
  kind,
  center: { x, y, z },
  halfExtents: { x: hx, y: hy, z: hz },
});
const solid = (x: number, y: number, z: number, hx: number, hy: number, hz: number): Block => block('solid', x, y, z, hx, hy, hz);

/** Прохід по осі x = 0, з півдня (−z) на північ (+z). */
const FLOWER_Z = 11;
const BARS_Z = 9;

/**
 * Залаштунки: жовта кімната 16×30 м зі стінами 4 м (x від −8 до 8, z від −18 до 12). Уздовж проходу, на всю ширину:
 * сходинка 1.0 м (z від −8 до −6; один стрибок), уступ 2.2 м (z від −1 до 1; між одним стрибком 1.6 і двома 2.9 —
 * потрібен подвійний), ґрати 3.2 м (z = 9; вище за подвійний стрибок — лише Blink). За ґратами Квітка в Селище.
 * Уступ від ґрат далі, ніж дістає подвійний стрибок з нього (≈ 5.3 м проти 8 м), а сходинка від уступу —
 * далі, ніж одинарний стрибок з неї. На уступ стрибають з розбігу (3.7 м до його стінки): впритул капсула
 * зависає на ребрі уступу, не долізши до верху.
 */
const signs: SignSpawn[] = [
  { position: { x: -3, y: 0, z: -10.5 }, facing: Math.PI, keys: ['arrows'] },
  { position: { x: 3, y: 0, z: -9.6 }, facing: Math.PI, keys: ['space'] },
  { position: { x: 3, y: 0, z: -4 }, facing: Math.PI, keys: ['space2'] },
  { position: { x: 3, y: 0, z: 6.5 }, facing: Math.PI, keys: ['shift'] },
];

const route: Route = {
  points: [
    { x: 0, y: 0, z: -10.5 }, // 0 старт
    { x: 0, y: 0, z: -9 }, // 1 перед сходинкою
    { x: 0, y: 0, z: -4.7 }, // 2 за 3.7 м до уступу: розбіг для подвійного стрибка
    { x: 0, y: 0, z: 3 }, // 3 за уступом
    { x: 0, y: 0, z: 7 }, // 4 перед ґратами
    { x: 0, y: 0, z: FLOWER_Z - 0.7 }, // 5 перед Квіткою
  ],
  actions: [
    { at: 1, do: 'jump' },
    { at: 2, do: 'doubleJump' },
    { at: 4, do: 'blink' },
    { at: 5, do: 'jump' },
  ],
};

export const BACKROOMS: Level = {
  spawn: { x: 0, y: 0, z: -10.5 },
  killY: -10,
  intro: true,
  blocks: [
    // Позаду старту ще 6 м підлоги (до z = −18), щоб камера стояла за Софійкою, а не впиралась у стіну.
    solid(0, -0.5, -3, 8, 0.5, 15), // підлога
    solid(0, 2, 12.25, 8.5, 2, 0.25), // стіни
    solid(0, 2, -18.25, 8.5, 2, 0.25),
    solid(8.25, 2, -3, 0.25, 2, 15),
    solid(-8.25, 2, -3, 0.25, 2, 15),
    solid(0, 0.5, -7, 8, 0.5, 1), // сходинка
    solid(0, 1.1, 0, 8, 1.1, 1), // уступ
    block('bars', 0, 1.6, BARS_Z, 8, 1.6, 0.15), // ґрати
  ],
  flowers: [{ id: 'flower-village', position: { x: 0, y: 0, z: FLOWER_Z }, color: 'yellow', opens: true, to: 'village' }],
  signs,
  route,
  trail: {
    flower: [
      { x: 0, y: 0, z: -10 },
      { x: 0, y: 0, z: -8.5 },
      { x: 0, y: 1, z: -7 },
      { x: 0, y: 0, z: -4.5 },
      { x: 0, y: 0, z: -2 },
      { x: 0, y: 2.2, z: 0 },
      { x: 0, y: 0, z: 3 },
      { x: 0, y: 0, z: 7 },
      { x: 0, y: 0, z: 9.4 },
    ],
    cage: [],
  },
};
