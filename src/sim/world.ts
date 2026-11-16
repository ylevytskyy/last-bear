import RAPIER from '@dimforge/rapier3d-compat';
import type { Block, Level } from './level';
import { TUNING, type Tuning } from './tuning';
import { levelBlocks } from './village-geometry';

let rulesReady = false;
let rulesInit: Promise<void> | null = null;

/** Вмикає Rapier один раз; повторні виклики дають той самий проміс. Без цього синхронні `createWorldNow` і `createSimNow` кидають помилку. */
export function initRules(): Promise<void> {
  rulesInit ??= RAPIER.init().then(() => {
    rulesReady = true;
  });
  return rulesInit;
}

/** Синхронно: світ Rapier. Лише після `await initRules()`. */
export function createWorldNow(tuning: Tuning = TUNING): { rapier: typeof RAPIER; world: RAPIER.World } {
  if (!rulesReady) throw new Error('initRules() has not finished: await it before creating a world synchronously');
  const world = new RAPIER.World({ x: 0, y: -tuning.gravity, z: 0 });
  world.timestep = tuning.step;
  return { rapier: RAPIER, world };
}

export async function createWorld(
  tuning: Tuning = TUNING,
): Promise<{ rapier: typeof RAPIER; world: RAPIER.World }> {
  await initRules();
  return createWorldNow(tuning);
}

/** Групи зіткнень: суцільні блоки, ґрати, Софійка. Промінь Blink бачить лише суцільні. */
export const SOLID_GROUP = 0x0001;
export const BARS_GROUP = 0x0002;
export const PLAYER_GROUP = 0x0004;
export const ALL_GROUPS = SOLID_GROUP | BARS_GROUP | PLAYER_GROUP;
/** Формат Rapier: старші 16 біт — належність, молодші — з чим взаємодіє. */
export const groups = (member: number, filter: number): number => (member << 16) | filter;

/** Ставить один блок у світ. */
export function addBlock(world: RAPIER.World, b: Block): RAPIER.Collider {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(b.center.x, b.center.y, b.center.z));
  return world.createCollider(
    RAPIER.ColliderDesc.cuboid(b.halfExtents.x, b.halfExtents.y, b.halfExtents.z).setCollisionGroups(
      groups(b.kind === 'solid' ? SOLID_GROUP : BARS_GROUP, ALL_GROUPS),
    ),
    body,
  );
}

/** Ставить блоки рівня, закриті Клітки й ніжки Квіток у світ і робить крок, щоб запити (промінь, форма) їх бачили. */
export function buildLevel(world: RAPIER.World, level: Level): void {
  for (const b of levelBlocks(level, new Set(), TUNING)) addBlock(world, b);
  world.step();
}
