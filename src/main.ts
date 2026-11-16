import { ARENA } from './levels/arena';
import { PLAYGROUND } from './levels/playground';
import { WORLDS } from './levels/worlds';
import { createGame, singleWorldGame, type Game, type GameEvent } from './sim/game';
import type { WorldId } from './sim/level';
import { createSim } from './sim/sim';
import { TUNING } from './sim/tuning';
import { keysToInput } from './view/keyboard';
import { createGameView } from './view/game-view';
import { preloadActors } from './view/glb-actors';
import { createInputLatch } from './view/input-latch';
import type { Previous } from './view/smoothing';

const MAX_STEPS_PER_FRAME = 5;
const BLOCKED_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

async function main(): Promise<void> {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('canvas #game not found');

  // Зріз — гра з трьох світів, старт у Залаштунках. `?level=playground|arena` — окремі рівні без переходів.
  // У dev: `?world=…` — старт у цьому світі, `?from=…` — звідки нібито прийшла, `?keys=N` — Ключі на старті.
  const params = new URLSearchParams(location.search);
  const choice = params.get('level');
  const dev = import.meta.env.DEV;
  const keys = dev ? Number(params.get('keys') ?? 0) || 0 : 0;
  const worldIds: readonly string[] = ['backrooms', 'village', 'honeycombs'];
  const asWorld = (v: string | null): WorldId | undefined => (v && worldIds.includes(v) ? (v as WorldId) : undefined);
  let game: Game;
  if (choice === 'arena' || choice === 'playground') {
    const level = choice === 'arena' ? ARENA : PLAYGROUND;
    game = singleWorldGame(await createSim(level, TUNING, { keys }), level);
  } else {
    const world = dev ? asWorld(params.get('world')) : undefined;
    const from = dev ? asWorld(params.get('from')) : undefined;
    game = await createGame(WORLDS, TUNING, { ...(world ? { world } : {}), ...(from ? { from } : {}), keys });
  }
  await preloadActors();
  const view = createGameView(canvas, game);
  const latch = createInputLatch();
  if (import.meta.env.DEV) {
    // Для перевірок у прихованій панелі браузера: кадри вручну, по `frameSeconds`.
    const advance = (seconds: number, frameSeconds = 1 / 60): void => {
      for (let t = 0; t < seconds - 1e-9; t += frameSeconds) tick(frameSeconds);
    };
    (window as unknown as { __lastBear: unknown }).__lastBear = {
      game,
      get sim() {
        return game.sim;
      },
      sound: view.sound,
      view,
      advance,
      latch,
    };
  }

  window.addEventListener('keydown', (e) => {
    view.sound.resume();
    if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) latch.press(e.code);
  });
  window.addEventListener('keyup', (e) => latch.release(e.code));
  canvas.addEventListener('mousedown', (e) => {
    view.sound.resume();
    if (e.button === 0) latch.press('Mouse0');
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) latch.release('Mouse0');
  });
  window.addEventListener('blur', () => latch.clear());
  // Камера мишею: клац по грі захоплює вказівник, рух миші крутить камеру, Esc відпускає.
  canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) void canvas.requestPointerLock?.();
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) view.mouse(e.movementX, e.movementY);
  });

  // Заставка: правила не крокують, поки дитина не натисне клавішу або не клацне. Dev-параметри її пропускають.
  const devStart = dev && (params.has('world') || params.has('keys') || params.has('from') || choice !== null);
  let started = devStart;
  if (!started) view.showSplash(() => {
    started = true;
    view.sound.resume();
    latch.clear();
  });

  /** Стан правил перед останнім кроком — для згладжування показу між кроками. */
  const snapshot = (): Previous => ({
    sofiyka: { position: { ...game.sim.sofiyka.position }, facing: game.sim.sofiyka.facing },
    enemies: new Map(game.sim.enemies.map((e) => [e.id, { ...e.position }])),
    movers: new Map(game.sim.movers.map((m) => [m.id, { ...m.position }])),
  });
  let previous = snapshot();

  let last = performance.now();
  let accumulator = 0;
  function loop(now: number): void {
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    tick(dt);
    requestAnimationFrame(loop);
  }
  /** Один кадр: правила крокують за накопиченим часом, показ малює. */
  function tick(dt: number): void {
    if (!started) {
      view.frame(dt, [], keysToInput(new Set(), view.cameraYaw()));
      return;
    }
    view.turnKeys(latch.snapshot(), dt);
    // У Вікні час гри йде повільніше: кроків правил менше за той самий реальний час.
    accumulator += dt * game.sim.timeScale;
    let input = keysToInput(latch.snapshot(), view.cameraYaw());
    const events: GameEvent[] = [];
    for (let i = 0; i < MAX_STEPS_PER_FRAME && accumulator >= TUNING.step; i++) {
      previous = snapshot();
      events.push(...game.step(input));
      latch.consumed();
      input = keysToInput(latch.snapshot(), view.cameraYaw());
      accumulator -= TUNING.step;
    }
    if (accumulator >= TUNING.step) accumulator = 0; // не наздоганяємо після довгої паузи
    // Частка шляху між останнім кроком правил і наступним: показ малює між ними.
    view.frame(dt, events, input, { previous, alpha: accumulator / TUNING.step });
  }
  requestAnimationFrame(loop);
}

main().catch((error) => {
  console.error(error);
});
