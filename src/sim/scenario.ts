import type { Game, GameEvent, Worlds } from './game';
import { NO_INPUT, type Input } from './input';
import type { Level, Vec3 } from './level';
import { progressOf, trailPath } from './guide';
import { createRouteDriver } from './route';
import type { Sim, SimEvent } from './sim';
import { strikeHits } from './strike';
import { TUNING } from './tuning';

/** Бот: вхід на цей крок; бачить стан правил (`Sim` або `Game`) і події попереднього кроку. */
export type Bot<S = Sim> = (subject: S, stepIndex: number, lastEvents: SimEvent[]) => Input;

/** Події переходу між світами — не події правил одного світу. */
const isSimEvent = (e: GameEvent): e is SimEvent => e.type !== 'worldLeft' && e.type !== 'worldEntered';

/**
 * Крокує правила з входом бота. Без `until` — доки не лишиться ворогів (для `Sim`) або доки Зріз не пройдено (для `Game`),
 * або не скінчиться `maxSteps`; з `until` — до першого кроку, події якого його задовольняють, або до `maxSteps`
 * (ворогів тоді не рахуємо). Бот `Game` бачить лише події правил (без `worldLeft`/`worldEntered`: світ він читає з `game.world`).
 */
export function playScenario(sim: Sim, bot: Bot, maxSteps: number, until?: (events: SimEvent[]) => boolean): { events: SimEvent[]; steps: number };
export function playScenario(game: Game, bot: Bot<Game>, maxSteps: number, until?: (events: GameEvent[]) => boolean): { events: GameEvent[]; steps: number };
export function playScenario(
  subject: Sim | Game,
  bot: Bot<never>,
  maxSteps: number,
  until?: (events: never[]) => boolean,
): { events: GameEvent[]; steps: number } {
  const game = 'sim' in subject ? subject : null;
  const run = bot as unknown as Bot<Sim | Game>;
  const stop = until as ((events: GameEvent[]) => boolean) | undefined;
  const events: GameEvent[] = [];
  let last: GameEvent[] = [];
  let steps = 0;
  const going = () => (stop ? true : game ? !game.complete : (subject as Sim).enemies.length > 0);
  while (steps < maxSteps && going()) {
    last = game ? game.step(run(game, steps, last.filter(isSimEvent))) : (subject as Sim).step(run(subject as Sim, steps, last.filter(isSimEvent)));
    events.push(...last);
    steps++;
    if (stop?.(last)) break;
  }
  return { events, steps };
}

/** «Сплячка»: нічого не натискає. */
export const sleeperBot: Bot = () => NO_INPUT;

/** Наскільки близько бот-«дитина» підходить до вразливого ворога перед Ударом, м. */
const STRIKE_DISTANCE = 1.0;

/** Дає вхід, у якому натиски (Shift, Удар, стрибок) йдуть за фронтом: наступний крок після натиску — відпускання. */
function createPresser(): (want: Input, holdJump?: boolean) => Input {
  let pressed: Input = NO_INPUT;
  return (want, holdJump = false) => {
    // Пробіл тримається, поки вона летить угору від натиску: відпущений рано — стрибок низький.
    const next = { ...want, blink: want.blink && !pressed.blink, strike: want.strike && !pressed.strike, jump: (want.jump && !pressed.jump) || holdJump };
    pressed = next;
    return next;
  };
}

/** Спільне правило «дитини»: у Вікні — Рефлекс; вразливий ворог поруч — Удар, обернувшись до нього. Інакше `null`. */
function react(sim: Sim, press: (want: Input, holdJump?: boolean) => Input): Input | null {
  const s = sim.sofiyka;
  if (sim.slowdown.open) return press({ ...NO_INPUT, blink: true });
  for (const e of sim.enemies) {
    const dx = e.position.x - s.position.x;
    const dz = e.position.z - s.position.z;
    const d = Math.hypot(dx, dz);
    if (d > STRIKE_DISTANCE + 0.6) continue;
    const facingIt = { position: s.position, facing: Math.atan2(dx, dz) };
    if (strikeHits(facingIt, e, TUNING) === 'hit') return press({ ...NO_INPUT, moveX: (dx / (d || 1)) * 1e-3, moveZ: (dz / (d || 1)) * 1e-3, strike: true });
  }
  return null;
}

/**
 * «Дитина»: у Вікні тисне Shift (Рефлекс); вразливого ворога поруч б'є, обернувшись до нього;
 * до застряглого — підходить; інакше йде до найближчого ворога, щоб той почав атаку.
 * Натиски чергуються з відпусканням, бо правила рахують фронт натиску.
 */
export function createChildBot(): Bot {
  const press = createPresser();
  return (sim) => {
    const s = sim.sofiyka;
    const reaction = react(sim, press);
    if (reaction) return reaction;

    const toward = (x: number, z: number, scale = 1) => {
      const dx = x - s.position.x;
      const dz = z - s.position.z;
      const d = Math.hypot(dx, dz) || 1;
      return { moveX: (dx / d) * scale, moveZ: (dz / d) * scale };
    };
    const distance = (x: number, z: number) => Math.hypot(x - s.position.x, z - s.position.z);

    const stuck = sim.enemies.filter((e) => e.vulnerable);
    const target = (stuck.length ? stuck : sim.enemies).reduce<(typeof sim.enemies)[number] | null>(
      (best, e) => (!best || distance(e.position.x, e.position.z) < distance(best.position.x, best.position.z) ? e : best),
      null,
    );
    if (!target) return press(NO_INPUT);
    const d = distance(target.position.x, target.position.z);
    if (target.vulnerable && d > STRIKE_DISTANCE) return press({ ...NO_INPUT, ...toward(target.position.x, target.position.z) });
    if (!target.vulnerable && !target.attacking && d > 3) return press({ ...NO_INPUT, ...toward(target.position.x, target.position.z) });
    return press(NO_INPUT);
  };
}

/** Готовий бот-«дитина» для одного прогону. Для кількох прогонів — `createChildBot()` на кожен. */
export const childBot: Bot = (() => {
  const bots = new WeakMap<Sim, Bot>();
  return (sim: Sim, i: number, last: SimEvent[]) => {
    let bot = bots.get(sim);
    if (!bot) bots.set(sim, (bot = createChildBot()));
    return bot(sim, i, last);
  };
})();

/** Наскільки близько бот-«провідник» підходить до точки Доріжки, щоб іти до наступної, м. */
const WAYPOINT_REACHED = 0.5;
/** Де бот стає перед ніжкою Квітки, м від її центра. */
const FLOWER_STAND_DISTANCE = 0.8;
/** Точність, з якою бот стає на місце, м. */
const STAND_PRECISION = 0.1;

/**
 * «Провідник»: йде по Доріжці, яку веде `progressOf` (до жовтої Квітки без Ключа, до Клітки з Ключем).
 * На кінці шляху до Квітки стає за 0.8 м від ніжки, чекає, поки Квітка розкрилась, і стрибає на місці;
 * на кінці шляху до Клітки йде до центра її дверей. Вікно й вразливого ворога поруч обробляє як «дитина»;
 * ворогів сам не шукає.
 */
export function createGuideBot(level: Level): Bot {
  const press = createPresser();
  const flower = (level.flowers ?? []).find((f) => f.opens && f.color === 'yellow');
  const cage = (level.cages ?? []).find((c) => c.working);
  let progress = progressOf(0, []);
  let index = 0;
  return (sim) => {
    const s = sim.sofiyka;
    const reaction = react(sim, press);
    if (reaction) return reaction;
    const next = progressOf(s.keys, sim.cages);
    if (next !== progress) {
      progress = next;
      index = 0;
    }
    const path = level.trail ? trailPath(progress, level.trail) : [];
    if (path.length === 0) return press(NO_INPUT);

    const dist = (to: Vec3) => Math.hypot(to.x - s.position.x, to.z - s.position.z);
    const go = (to: Vec3, stop: number): Input | null => {
      const d = dist(to);
      return d < stop ? null : press({ ...NO_INPUT, moveX: (to.x - s.position.x) / d, moveZ: (to.z - s.position.z) / d });
    };
    // Наступна точка, коли до поточної менше за WAYPOINT_REACHED; остання точка — кінець шляху.
    while (index < path.length - 1 && dist(path[index]!) < WAYPOINT_REACHED) index++;
    if (index < path.length - 1) return go(path[index]!, 0)!;
    const last = path[path.length - 1]!;

    if (progress === 'needKey' && flower) {
      const dx = flower.position.x - last.x;
      const dz = flower.position.z - last.z;
      const d = Math.hypot(dx, dz) || 1;
      const stand = { x: flower.position.x - (dx / d) * FLOWER_STAND_DISTANCE, y: 0, z: flower.position.z - (dz / d) * FLOWER_STAND_DISTANCE };
      const step = go(stand, STAND_PRECISION);
      if (step) return step;
      const open = (sim.flowers.find((f) => f.id === flower.id)?.openness ?? 0) >= 1 - 1e-6;
      return press({ ...NO_INPUT, jump: open && s.grounded }, !s.grounded && s.velocityY > 0);
    }
    if (progress === 'haveKey' && cage) {
      const half = TUNING.village.cageSize / 2;
      const door = { x: cage.position.x + Math.sin(cage.facing) * half, y: 0, z: cage.position.z + Math.cos(cage.facing) * half };
      return go(door, STAND_PRECISION) ?? press(NO_INPUT);
    }
    return press(NO_INPUT);
  };
}

/**
 * Бот за маршрутом рівня (`Level.route`): іде за водієм маршруту, а Вікно віддає Рефлексу й Ударам «дитини».
 * У Вікні бот стоїть і лише тисне Shift: якщо місця за ворогом немає, Рефлекс не відбувається, але й стрибка не буде.
 */
function createRouteBot(level: Level): Bot {
  const press = createPresser();
  const driver = createRouteDriver(level.route!, { level });
  let previous: Input = NO_INPUT;
  return (sim, _i, last) => {
    const reaction = react(sim, press);
    if (reaction) return (previous = reaction);
    const out = driver.step(sim, last, previous);
    // Натиск за фронтом і утримання пробілу на підйомі вже вирішив водій маршруту.
    previous = { ...press(out.input), jump: out.input.jump };
    return previous;
  };
}

/**
 * Бот Зрізу: у світі з `route` іде за ним, у Селищі — «провідник»; завжди Рефлекс у Вікні й Удар вразливих ворогів.
 * Під час переходу між світами стоїть; на кожен новий `Sim` будує бота наново.
 */
export function createSliceBot(worlds: Worlds): Bot<Game> {
  let current: { sim: Sim; bot: Bot } | null = null;
  return (game, i, last) => {
    if (game.transition > 0) return NO_INPUT;
    if (!current || current.sim !== game.sim) {
      const level = worlds[game.world];
      current = { sim: game.sim, bot: level.route ? createRouteBot(level) : createGuideBot(level) };
    }
    return current.bot(game.sim, i, last);
  };
}
