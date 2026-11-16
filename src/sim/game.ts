import type { FlowerSpawn, Level, Vec3, WorldId } from './level';
import type { Input } from './input';
import { createSimNow, initRules, type Sim, type SimEvent, type SimStart } from './sim';
import { TUNING, type Tuning } from './tuning';

export type Worlds = Record<WorldId, Level>;
export type GameEvent =
  | SimEvent
  | { type: 'worldLeft'; from: WorldId; to: WorldId; color: FlowerSpawn['color'] }
  | { type: 'worldEntered'; world: WorldId; from: WorldId };

/** Гра: світи, що переживають перехід (Ключі, відкриті Клітки, Серця), і зміна світу посеред переходу. */
export type Game = {
  step(input: Input): GameEvent[]; // рівно 1/60 с
  readonly world: WorldId;
  readonly sim: Sim; // поточний світ; інший об'єкт після зміни світу
  readonly level: Level;
  readonly transition: number; // 0, або ігрові секунди переходу, що лишились
  readonly complete: boolean; // Зріз пройдено: справжню Клітку відкрито Ключем
  dispose(): void;
};

/** Допуск відліку, як у `slowdown.ts`. */
const EPS = 1e-9;

/**
 * Гра зі світами. Стартує в `start.world` (за замовчуванням Залаштунки); `start.from` — звідки Софійка нібито прийшла
 * (місце входу — `entries[from]` цього світу). `makeSim` — для тестів (шпигун, що лічить `dispose`).
 */
export async function createGame(
  worlds: Worlds,
  tuning: Tuning = TUNING,
  start: { world?: WorldId; keys?: number; from?: WorldId } = {},
  makeSim: typeof createSimNow = createSimNow,
): Promise<Game> {
  await initRules();
  let world: WorldId = start.world ?? 'backrooms';
  let keys = start.keys ?? 0;
  let hearts: number | undefined;
  const openCages = new Set<string>();

  const build = (id: WorldId, from: WorldId | undefined): Sim => {
    const entry = from ? worlds[id].entries?.[from] : undefined;
    const simStart: SimStart = {
      keys,
      openCages: [...openCages],
      ...(hearts !== undefined ? { hearts } : {}),
      ...(entry ? { spawn: entry } : {}),
    };
    return makeSim(worlds[id], tuning, simStart);
  };

  let sim = build(world, start.from);
  let transition = 0;
  let pending: { to: WorldId; from: WorldId } | null = null;
  let complete = false;

  /** Старий світ звільняється, новий будується з тим, що пережило перехід. */
  function enter(events: GameEvent[]): void {
    const { to, from } = pending!;
    pending = null;
    keys = sim.sofiyka.keys;
    hearts = sim.sofiyka.hearts;
    for (const c of sim.cages) if (c.open) openCages.add(c.id);
    sim.dispose();
    world = to;
    sim = build(to, from);
    events.push({ type: 'worldEntered', world: to, from });
  }

  return {
    step(input) {
      if (transition > EPS) {
        const events: GameEvent[] = [];
        transition = Math.max(0, transition - tuning.step);
        if (transition <= EPS) transition = 0;
        if (pending && transition <= tuning.worlds.transitionSeconds / 2 + EPS) enter(events);
        return events;
      }
      const events: GameEvent[] = sim.step(input);
      if (events.some((e) => e.type === 'sliceComplete')) complete = true;
      for (const e of events) {
        if (e.type !== 'flowerEntered') continue;
        const flower = worlds[world].flowers?.find((f) => f.id === e.id);
        if (!flower?.to) continue;
        pending = { to: flower.to, from: world };
        transition = tuning.worlds.transitionSeconds;
        events.push({ type: 'worldLeft', from: world, to: flower.to, color: flower.color });
        break;
      }
      return events;
    },
    get world() {
      return world;
    },
    get sim() {
      return sim;
    },
    get level() {
      return worlds[world];
    },
    get transition() {
      return transition;
    },
    get complete() {
      return complete;
    },
    dispose() {
      sim.dispose();
    },
  };
}

/** Гра з одним світом для `?level=playground|arena`: без переходів, `flowerEntered` лишається подією правил. */
export function singleWorldGame(sim: Sim, level: Level): Game {
  let complete = false;
  return {
    step: (input) => {
      const events = sim.step(input);
      if (events.some((e) => e.type === 'sliceComplete')) complete = true;
      return events;
    },
    world: 'village',
    sim,
    level,
    transition: 0,
    get complete() {
      return complete;
    },
    dispose: () => sim.dispose(),
  };
}
