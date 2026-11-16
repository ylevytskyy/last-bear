import type { Block, EnemySpawn, Level, MoverSpawn, Route, SignSpawn, Vec3 } from '../sim/level';

/**
 * Стільники: шестикутні платформи в небі, ланцюг уздовж осі x (z = 0), прірва під ними (`killY` −10).
 * Шестикутник із трьох вкладених блоків (центральна смуга найширша): ширина по x 1.75·R, глибина по z √3·R.
 * Шлях: старт → стрибок → перша рухома платформа → два камені (подвійний стрибок, уступ +1 м) → друга рухома →
 * велика платформа → Бджола → велика платформа з Джерелом (ще Бджола) → платформа з Квіткою (третя Бджола).
 * Рухомі платформи й камені — далі за `aggroRadius` від Бджіл; платформи біля Бджіл — завширшки не менше 6 м.
 */
const SLAB = 0.5; // півтовщини платформи, м
const WIDE = 0.875; // півширина центральної смуги шестикутника в частках R
const MOVER_HALF = 1.75; // півсторона рухомої платформи, м
const OVERLAP = 0.3; // на скільки край рухомої платформи заходить на сусідню в її кінцях, м
const MOVER_RUN = 7; // відстань між кінцями A і B, м
const EDGE = 0.1; // точка стрибка — на стільки всередині від краю, м

type Hex = { cx: number; top: number; r: number; left: number; right: number };
const hexAt = (cx: number, top: number, r: number): Hex => ({ cx, top, r, left: cx - WIDE * r, right: cx + WIDE * r });
/** Шестикутник, що лишає `gap` м порожнечі за правим краєм попереднього. */
const hexAfter = (prev: { right: number }, gap: number, top: number, r: number): Hex => hexAt(prev.right + gap + WIDE * r, top, r);

const slab = (cx: number, top: number, cz: number, hx: number, hz: number): Block => ({
  kind: 'solid',
  center: { x: cx, y: top - SLAB, z: cz },
  halfExtents: { x: hx, y: SLAB, z: hz },
});
/** Три вкладені блоки, вписані в шестикутник (кути не виступають за нього). */
function hexBlocks(h: Hex): Block[] {
  const half = (h.r * Math.sqrt(3)) / 2;
  return [
    slab(h.cx, h.top, 0, WIDE * h.r, half / 4),
    slab(h.cx, h.top, 0, 0.75 * h.r, half / 2),
    slab(h.cx, h.top, 0, 0.5 * h.r, half),
  ];
}
/** Рухома платформа від правого краю `prev`: у точці A вона на `OVERLAP` м заходить на нього. */
function moverAfter(id: string, prev: Hex, top: number): { spawn: MoverSpawn; a: number; b: number; right: number } {
  const a = prev.right - OVERLAP + MOVER_HALF;
  const b = a + MOVER_RUN;
  return {
    spawn: { id, block: slab(a, top, 0, MOVER_HALF, MOVER_HALF), to: { x: b, y: top - SLAB, z: 0 } },
    a,
    b,
    right: b + MOVER_HALF,
  };
}
const on = (x: number, top: number, z = 0): Vec3 => ({ x, y: top, z });

// Платформи.
const p0 = hexAt(0, 0, 4); // старт
const p1 = hexAfter(p0, 2.0, 0, 4); // стрибок через 2 м
const m1 = moverAfter('mover-1', p1, 0);
const p2 = hexAt(m1.right - OVERLAP + WIDE * 2, 0, 2); // камінь: з платформи на нього
const p3 = hexAfter(p2, 3.5, 1.0, 2); // камінь +1 м, подвійний стрибок
const m2 = moverAfter('mover-2', p3, 1.0);
const p4 = hexAt(m2.right - OVERLAP + WIDE * 4.5, 1.0, 4.5); // велика, без Бджіл
const p5 = hexAfter(p4, 3.5, 1.0, 4.5); // велика, Бджола
const p6 = hexAfter(p5, 3.5, 1.0, 5.5); // найбільша: Джерело, Бджола
const p7 = hexAfter(p6, 3.5, 1.0, 4.5); // Квітка, Бджола

const SOURCE_X = p6.cx + 2;
const STAND_X = SOURCE_X - 2.7; // звідси Удар дістає грані казана; Ключ лягає в 0.9 м попереду
const FLOWER_X = p7.cx + 1.6;
const FLOWER_STAND_X = FLOWER_X - 0.8; // за 0.7 м капсула впритул до ніжки, і стрибок загрузає

const enemies: EnemySpawn[] = [
  { id: 'bee-1', kind: 'bee', position: { x: p5.cx + 1, y: p5.top + 1.5, z: 0 }, facing: -Math.PI / 2 },
  { id: 'bee-2', kind: 'bee', position: { x: SOURCE_X, y: p6.top + 1.5, z: 3.5 }, facing: -Math.PI / 2 },
  { id: 'bee-3', kind: 'bee', position: { x: p7.cx + 1.5, y: p7.top + 1.5, z: -2.5 }, facing: -Math.PI / 2 },
];

const signs: SignSpawn[] = [{ position: on(STAND_X - 1.8, p6.top, 2.4), facing: -Math.PI / 2, keys: ['strike'] }];

const route: Route = {
  points: [
    on(p0.cx, p0.top), // 0 старт
    on(p0.right - EDGE, p0.top), // 1 край першої платформи: стрибок
    on(p1.right - 0.9, p1.top), // 2 чекає першу рухому в A
    on(m1.a, 0), // 3 на ній, їде до B
    on(p2.right - EDGE, p2.top), // 4 край каменя: подвійний стрибок
    on(p3.right - 0.9, p3.top), // 5 чекає другу рухому в A
    on(m2.a, p3.top), // 6 на ній, їде до B
    on(p4.right - EDGE, p4.top), // 7 край великої: стрибок (з Бджолою попереду подвійний довше тримав би її в повітрі, коли відкривається Вікно)
    on(p5.right - EDGE, p5.top), // 8 край з Бджолою: подвійний стрибок
    on(STAND_X, p6.top), // 9 перед Джерелом: Удари
    on(p6.right - EDGE, p6.top), // 10 край: подвійний стрибок
    on(FLOWER_STAND_X, p7.top), // 11 перед Квіткою: стрибок
  ],
  actions: [
    { at: 1, do: 'jump' },
    { at: 2, do: { waitMover: 'mover-1', near: 'A' } },
    { at: 3, do: { waitMover: 'mover-1', near: 'B' } },
    { at: 4, do: 'doubleJump' },
    { at: 5, do: { waitMover: 'mover-2', near: 'A' } },
    { at: 6, do: { waitMover: 'mover-2', near: 'B' } },
    { at: 7, do: 'jump' },
    { at: 8, do: 'doubleJump' },
    { at: 9, do: 'strikeSource' },
    { at: 10, do: 'doubleJump' },
    { at: 11, do: 'jump' },
  ],
};

export const HONEYCOMBS: Level = {
  spawn: on(p0.cx, p0.top),
  killY: -10,
  entries: { village: on(p0.cx, p0.top) },
  blocks: [p0, p1, p2, p3, p4, p5, p6, p7].flatMap(hexBlocks),
  movers: [m1.spawn, m2.spawn],
  source: { id: 'source', position: on(SOURCE_X, p6.top) },
  flowers: [{ id: 'flower-village', position: on(FLOWER_X, p7.top), color: 'yellow', opens: true, opensWhen: 'keyHeld', to: 'village' }],
  enemies,
  signs,
  route,
  trail: {
    flower: [
      on(p0.cx, p0.top),
      on(p1.cx, p1.top),
      on(m1.a, 0),
      on(m1.b, 0),
      on(p2.cx, p2.top),
      on(p3.cx, p3.top),
      on(m2.a, p3.top),
      on(m2.b, p3.top),
      on(p4.cx, p4.top),
      on(p5.cx, p5.top),
      on(STAND_X, p6.top),
    ],
    cage: [on(STAND_X, p6.top), on(p6.cx + 2, p6.top, -3), on(p7.cx - 1, p7.top), on(FLOWER_STAND_X, p7.top)],
  },
};
