import { NO_INPUT, type Input } from './input';
import type { Level, Route, RouteAction, Vec3 } from './level';
import type { Sim, SimEvent } from './sim';
import { TUNING } from './tuning';

export type RouteActionName = 'jump' | 'doubleJump' | 'blink' | 'strikeSource' | 'waitMover';
export type WalkOptions = {
  /** Дії, які бот пропускає (для тестів «без Blink» тощо). */
  skip?: readonly RouteActionName[];
  /** Рівень маршруту: потрібен дії `waitMover` (кінці платформи) і `strikeSource` (де Джерело). */
  level?: Level;
};

/** Наступна точка маршруту, коли до поточної ближче за стільки по xz, м. */
const REACHED = 0.4;
/** Перед Ударами по Джерелу бот стає на точку маршруту так точно, м. */
const STAND_PRECISION = 0.1;
/** Платформа «біля кінця», коли ближче за стільки до нього, м. */
const MOVER_NEAR = 0.5;
/** Квітка поруч, що ще розкривається: стрибок чекає, поки вона розкриється, коли Софійка ближче за стільки, м. */
const FLOWER_WAIT_DISTANCE = TUNING.village.flowerEnterRadius + 1.5;
/** Після кінця маршруту бот ще стільки кроків дає стрибку завершитись (приземлитись), щоб не обірвати його посередині. */
const SETTLE_STEPS = 120;
/** Малий натиск, що лише повертає Софійку лицем у бік точки. */
const AIM = 1e-3;

const actionName = (a: RouteAction): RouteActionName => (typeof a === 'string' ? a : 'waitMover');

/** Що дає водій маршруту на один крок: вхід і чи маршрут уже пройдено (бот далі не веде). */
export type RouteDrive = { input: Input; finished: boolean };
/** Водій маршруту: за станом правил і входом попереднього кроку дає вхід цього кроку. */
export type RouteDriver = {
  step(sim: Sim, lastEvents: readonly SimEvent[], previous: Input): RouteDrive;
  /** Індекс останньої досягнутої точки (-1, якщо жодної). */
  reached(): number;
};

/**
 * Водій маршруту: той самий розум, що в `walkRoute`, але по одному кроку, щоб бот Зрізу міг поєднати його з Рефлексом.
 * `previous` — вхід, який справді пішов у правила на попередньому кроці (натиски рахуються за фронтом).
 * `lastEvents` — події попереднього кроку: з них водій дізнається, що Софійка вже стрибнула в Квітку.
 */
export function createRouteDriver(route: Route, options: WalkOptions = {}): RouteDriver {
  const skip = new Set(options.skip ?? []);
  const queue: RouteAction[] = [];
  let reached = -1;
  let next = 0; // точка, до якої йдемо
  let previous: Input = NO_INPUT;
  let sim!: Sim;
  /** Стан дії, що триває: скільки разів уже стрибнула. */
  let phase = 0;
  let settle = 0;
  let flowerSeen = false;

  const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
  const toward = (to: Vec3, scale: number): Pick<Input, 'moveX' | 'moveZ'> => {
    const p = sim.sofiyka.position;
    const d = dist(to, p);
    return d < 1e-9 ? { moveX: 0, moveZ: 0 } : { moveX: ((to.x - p.x) / d) * scale, moveZ: ((to.z - p.z) / d) * scale };
  };
  /** Рух до наступної точки (або стоїть, коли точок більше немає). */
  const walk = (): Pick<Input, 'moveX' | 'moveZ'> => (next < route.points.length ? toward(route.points[next]!, 1) : { moveX: 0, moveZ: 0 });
  const aimAtNext = (): Pick<Input, 'moveX' | 'moveZ'> => (next < route.points.length ? toward(route.points[next]!, AIM) : { moveX: 0, moveZ: 0 });
  const nearOpeningFlower = (): boolean =>
    sim.flowers.some((f) => {
      if (f.openness <= 0 || f.openness >= 1 - 1e-6) return false;
      const spawn = options.level?.flowers?.find((s) => s.id === f.id);
      return !spawn || dist(spawn.position, sim.sofiyka.position) < FLOWER_WAIT_DISTANCE;
    });
  /** Натиск за фронтом: кнопка не тримається двох кроків поспіль. */
  const edge = (input: Input): Input => ({
    ...input,
    jump: input.jump && !previous.jump,
    blink: input.blink && !previous.blink,
    strike: input.strike && !previous.strike,
  });

  /** Вхід на цей крок для дії, що триває; `done` — дія виконана цим кроком. */
  function act(action: RouteAction): { input: Input; done: boolean } {
    const s = sim.sofiyka;
    if (typeof action === 'object') {
      const spawn = options.level?.movers?.find((m) => m.id === action.waitMover);
      if (!spawn) throw new Error(`walkRoute: waitMover needs options.level with mover ${action.waitMover}`);
      const end = action.near === 'A' ? spawn.block.center : spawn.to;
      const at = sim.movers.find((m) => m.id === action.waitMover)!.position;
      const near = Math.hypot(at.x - end.x, at.y - end.y, at.z - end.z) < MOVER_NEAR;
      return { input: near ? { ...NO_INPUT, ...walk() } : NO_INPUT, done: near };
    }
    switch (action) {
      case 'jump': {
        // Останній стрибок маршруту (у Квітку) — з самої точки: «дійшла» вже за 0.4 м, а бутон ловить лише зблизька.
        const stand = route.points[reached]!;
        if (reached === route.points.length - 1 && s.grounded && !nearOpeningFlower() && dist(stand, s.position) > STAND_PRECISION) {
          return { input: { ...NO_INPUT, ...toward(stand, 1) }, done: false };
        }
        if (!s.grounded || nearOpeningFlower()) return { input: { ...NO_INPUT, ...(nearOpeningFlower() ? {} : walk()) }, done: false };
        return { input: { ...NO_INPUT, ...walk(), jump: true }, done: true };
      }
      case 'doubleJump': {
        if (phase === 0) {
          if (!s.grounded) return { input: { ...NO_INPUT, ...walk() }, done: false };
          phase = 1;
          return { input: { ...NO_INPUT, ...walk(), jump: true }, done: false };
        }
        // На вершині першого стрибка (кнопка між натисками відпущена): другий.
        if (!s.grounded && s.velocityY <= 0 && !previous.jump) return { input: { ...NO_INPUT, ...walk(), jump: true }, done: true };
        return { input: { ...NO_INPUT, ...walk() }, done: false };
      }
      case 'blink': {
        if (s.blinkCooldown > 1e-6) return { input: NO_INPUT, done: false };
        return { input: { ...NO_INPUT, ...aimAtNext(), blink: true }, done: true };
      }
      case 'strikeSource': {
        const source = options.level?.source;
        const state = sim.source;
        if (!source || !state) throw new Error('walkRoute: strikeSource needs options.level with a source');
        if (state.broken) {
          if (!state.keyAt) return { input: NO_INPUT, done: true };
          return { input: { ...NO_INPUT, ...toward(state.keyAt, 1) }, done: false };
        }
        // До Ударів — точно на місце маршруту (точка «дійшла» за 0.4 м, а Удар дістає не так далеко).
        const stand = route.points[reached]!;
        if (dist(stand, s.position) > STAND_PRECISION) return { input: { ...NO_INPUT, ...toward(stand, 1) }, done: false };
        const aim = toward(source.position, AIM);
        return { input: { ...NO_INPUT, ...aim, strike: s.mode !== 'ATTACK' }, done: false };
      }
    }
  }

  return {
    reached: () => reached,
    step(subject, lastEvents, prev) {
      sim = subject;
      previous = prev;
      if (lastEvents.some((e) => e.type === 'flowerEntered')) flowerSeen = true;
      // Точки, до яких дійшла; дії точки ставимо в чергу (пропущені — відкидаємо).
      while (queue.length === 0 && next < route.points.length && dist(route.points[next]!, sim.sofiyka.position) < REACHED) {
        reached = next;
        for (const a of route.actions) if (a.at === next && !skip.has(actionName(a.do))) queue.push(a.do);
        next++;
        phase = 0;
      }
      let input: Input;
      if (queue.length > 0) {
        const out = act(queue[0]!);
        input = out.input;
        if (out.done) {
          queue.shift();
          phase = 0;
        }
      } else if (next < route.points.length) {
        input = { ...NO_INPUT, ...walk() };
      } else {
        // Маршрут пройдено: даємо останньому стрибку завершитись.
        if (sim.sofiyka.grounded || settle++ >= SETTLE_STEPS || flowerSeen) return { input: NO_INPUT, finished: true };
        input = NO_INPUT;
      }
      const pressed = edge(input);
      // Пробіл тримається, поки вона летить угору від свого натиску: відпущений рано — стрибок низький.
      const holding = previous.jump && !sim.sofiyka.grounded && sim.sofiyka.velocityY > 0;
      return { input: holding ? { ...pressed, jump: true } : pressed, finished: false };
    },
  };
}

/**
 * Крокує `sim` за `route`: іде від точки до точки (наступна, коли до поточної < 0.4 м по xz), а на `points[at]`
 * виконує дію. Повертає індекс останньої досягнутої точки (-1, якщо жодної), події й кроки.
 * - `jump` — стрибок і далі рух;
 * - `doubleJump` — стрибок, на вершині (velocityY ≤ 0) другий;
 * - `blink` — повертається до наступної точки й Blink;
 * - `strikeSource` — стає точно на точку, Удари, поки Джерело ціле, потім іде до Ключа, поки той не підібраний;
 * - `{ waitMover, near }` — стоїть, доки платформа не ближче 0.5 м до свого кінця `near`.
 */
export function walkRoute(
  sim: Sim,
  route: Route,
  maxSteps: number,
  options: WalkOptions = {},
): { reached: number; events: SimEvent[]; steps: number } {
  const driver = createRouteDriver(route, options);
  const events: SimEvent[] = [];
  let last: SimEvent[] = [];
  let previous: Input = NO_INPUT;
  let steps = 0;
  while (steps < maxSteps) {
    const out = driver.step(sim, last, previous);
    if (out.finished) break;
    previous = out.input;
    last = sim.step(previous);
    events.push(...last);
    steps++;
  }
  return { reached: driver.reached(), events, steps };
}
