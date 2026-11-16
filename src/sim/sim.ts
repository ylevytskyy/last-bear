import type { Collider } from '@dimforge/rapier3d-compat';
import { NO_INPUT, type Input } from './input';
import type { Block, Level, MoverSpawn, Vec3 } from './level';
import { TUNING, type Tuning } from './tuning';
import { resolveBlink } from './blink';
import { isSafeSpot } from './safe-ground';
import { resolveReflex } from './reflex';
import { strikeCenter, strikeHits } from './strike';
import { keyDropAt, sourceBlock, strikeHitsSource } from './source';
import { closeSlowdown, createSlowdownBook, stepSlowdown } from './slowdown';
import { createBee, stepBee, stickBee, type BeeInternal, type BeeState } from './enemies/bee';
import { createTurtle, stepTurtle, type TurtleInternal, type TurtleState } from './enemies/turtle';
import { entersFlower, stepFlower } from './flowers';
import { moverPosition } from './movers';
import { cageDoor, staticBlocks } from './village-geometry';
import { ALL_GROUPS, BARS_GROUP, PLAYER_GROUP, SOLID_GROUP, addBlock, createWorldNow, groups, initRules } from './world';

export { initRules };

export type SofiykaMode = 'IDLE' | 'RUN' | 'JUMP' | 'BLINK' | 'ATTACK' | 'HURT';
export type { BeeState, TurtleState };
export type EnemyState = {
  id: string;
  kind: 'bee' | 'turtle';
  position: Vec3; // Бджола — центр тіла; Черепаха — підошви
  facing: number; // рад, 0 = +z; для Черепахи — куди дивиться голова, Колба на протилежному боці
  state: BeeState | TurtleState;
  stateTime: number; // с у поточному стані (для пози в показі)
  attacking: boolean; // від початку замаху до кінця удару
  vulnerable: boolean; // лише Бджола: true в STUCK
  hp: number;
};
export type CageState = { id: string; open: boolean; working: boolean };
export type FlowerState = { id: string; openness: number }; // 0 — бутон, 1 — розкрита
/** Джерело: Удари, що лишились; розбите; де лежить Ключ, що випав і ще не підібраний. */
export type SourceState = { hp: number; broken: boolean; keyAt: Vec3 | null };
export type SlowdownState = { open: boolean; remaining: number; enemyId: string | null }; // remaining — реальні секунди
export type SofiykaState = {
  position: Vec3; // підошви
  facing: number; // рад, 0 = +z
  velocityY: number;
  grounded: boolean;
  jumpsUsed: 0 | 1 | 2;
  blinkCooldown: number; // с до готовності, 0 = готовий
  hearts: number;
  invulnerable: number; // с до кінця невразливості
  mode: SofiykaMode;
  keys: number;
};
export type SimEvent =
  | { type: 'jumped'; double: boolean }
  | { type: 'landed' }
  | { type: 'blinked'; from: Vec3; to: Vec3 }
  | { type: 'heartLost'; cause: 'fall' | 'hit' }
  | { type: 'returned'; to: Vec3 }
  | { type: 'respawned' }
  | { type: 'enemyWindup'; id: string }
  | { type: 'windowOpened'; enemyId: string }
  | { type: 'windowClosed'; reflexed: boolean }
  | { type: 'reflexed'; enemyId: string; from: Vec3; to: Vec3 }
  | { type: 'struck'; enemyId: string | null; hit: boolean }
  | { type: 'enemyDefeated'; id: string }
  | { type: 'cageOpened'; id: string }
  | { type: 'flowerEntered'; id: string }
  | { type: 'sourceStruck'; hp: number }
  | { type: 'sourceBroken' }
  | { type: 'keyPicked' }
  | { type: 'sliceComplete' };
export type Sim = {
  step(input: Input): SimEvent[]; // рівно 1/60 с
  readonly sofiyka: SofiykaState;
  readonly time: number; // с ігрового часу
  readonly enemies: readonly EnemyState[];
  readonly timeScale: number; // 1, або менше у Вікні; показ множить на нього час кадру
  readonly slowdown: SlowdownState;
  readonly cages: readonly CageState[];
  readonly flowers: readonly FlowerState[];
  readonly movers: readonly { id: string; position: Vec3 }[]; // центри рухомих платформ зараз
  readonly source: SourceState | null; // null — у рівні немає Джерела
  readonly checkpoint: Vec3; // куди Відродження ставить Софійку: старт рівня або відкрита Клітка
  rayDistance(from: Vec3, dir: Vec3, max: number): number; // до суцільного блока; max, якщо вільно
  dispose(): void;
};

/**
 * Параметри старту правил: Ключі, Клітки, відкриті від початку (без дверей), Серця і місце появи
 * (воно ж Контрольна точка) замість `level.spawn`.
 */
export type SimStart = { keys?: number; openCages?: readonly string[]; hearts?: number; spawn?: Vec3 };

/** Промінь униз для «стоїть на платформі»: звідки (над підошвами) і наскільки глибоко під ними шукає землю, м. */
const FOOT_LIFT = 0.2;
const FOOT_REACH = 0.35;

/** Удар: с від початку; кого вже вразив; хто вже дав «дзень»; чи повідомлено про промах. */
type StrikeRun = { time: number; touched: Set<string>; blocked: Set<string>; reported: boolean };

const sameBlock = (a: Block, b: Block): boolean =>
  ['x', 'y', 'z'].every((k) => a.center[k as 'x'] === b.center[k as 'x'] && a.halfExtents[k as 'x'] === b.halfExtents[k as 'x']);

export async function createSim(level: Level, tuning: Tuning = TUNING, start: SimStart = {}): Promise<Sim> {
  await initRules();
  return createSimNow(level, tuning, start);
}

/** Те саме синхронно: лише після `await initRules()`, інакше помилка. */
export function createSimNow(level: Level, tuning: Tuning = TUNING, start: SimStart = {}): Sim {
  const { rapier, world } = createWorldNow(tuning);
  const spawn = start.spawn ?? level.spawn;

  // Світ: блоки рівня, закриті Клітки, ніжки Квіток. Двері справжніх Кліток запам'ятовуємо, щоб зняти їх при відкритті.
  const cageSpawns = level.cages ?? [];
  const openCages = new Set<string>(start.openCages ?? []);
  const doors = new Map<string, Collider>();
  for (const b of staticBlocks(level, openCages, tuning)) {
    const collider = addBlock(world, b);
    const cage = cageSpawns.find((c) => c.working && sameBlock(b, cageDoor(c, tuning)));
    if (cage) doors.set(cage.id, collider);
  }
  // Рухомі платформи: нерухомі тіла, які ми переставляємо самі (кінематичне тіло з швидкістю Rapier непередбачувано підтягує капсулу).
  const moverSpawns = level.movers ?? [];
  const moverBodies = moverSpawns.map((m) => {
    const moverBody = world.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(m.block.center.x, m.block.center.y, m.block.center.z),
    );
    const moverCollider = world.createCollider(
      rapier.ColliderDesc.cuboid(m.block.halfExtents.x, m.block.halfExtents.y, m.block.halfExtents.z).setCollisionGroups(
        groups(SOLID_GROUP, ALL_GROUPS),
      ),
      moverBody,
    );
    return { spawn: m, body: moverBody, handle: moverCollider.handle };
  });
  // Казан Джерела: суцільний блок, знімається, коли Джерело розбито.
  const sourceSpawn = level.source ?? null;
  const sourceCollider = sourceSpawn ? addBlock(world, sourceBlock(sourceSpawn, tuning)) : null;
  const moverHandles = new Set(moverBodies.map((m) => m.handle));
  const moverAt = (m: MoverSpawn, t: number): Vec3 => moverPosition(m.block.center, m.to, t, tuning.movers.speed);
  world.step();

  const r = tuning.capsuleRadius;
  const halfCylinder = (tuning.capsuleHeight - 2 * r) / 2;
  const centerOffset = tuning.capsuleHeight / 2; // від підошов до центра капсули
  const body = world.createRigidBody(
    rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(
      spawn.x,
      spawn.y + centerOffset,
      spawn.z,
    ),
  );
  const collider = world.createCollider(
    rapier.ColliderDesc.capsule(halfCylinder, r).setCollisionGroups(groups(PLAYER_GROUP, ALL_GROUPS)),
    body,
  );
  const controller = world.createCharacterController(0.01);
  controller.setUp({ x: 0, y: 1, z: 0 });
  controller.enableSnapToGround(0.1);

  world.step();

  const sofiyka: SofiykaState = {
    position: { ...spawn },
    facing: 0,
    velocityY: 0,
    grounded: true,
    jumpsUsed: 0,
    blinkCooldown: 0,
    hearts: start.hearts ?? tuning.hearts,
    invulnerable: 0,
    mode: 'IDLE',
    keys: start.keys ?? 0,
  };
  const flowerSpawns = level.flowers ?? [];
  let sourceHp = tuning.hitsToDefeat.source;
  let sourceBroken = false;
  let keyAt: Vec3 | null = null;
  const openness = new Map<string, number>(flowerSpawns.map((f) => [f.id, 0]));
  /** Куди ставить Відродження: старт рівня, а після відкриття Клітки — фіксоване місце перед її дверима. */
  let checkpoint: Vec3 = { ...spawn };
  let time = 0;
  let jumpHeld = false;
  /** Скільки секунд вона в повітрі після останньої землі (для «койота»). */
  let airSeconds = 0;
  /** Скільки ще секунд натиск стрибка, зроблений у повітрі, чекає приземлення («буфер»). */
  let jumpBuffer = 0;
  /** Приземлилась із натиском у буфері: стрибок на наступному кроці. */
  let queuedJump = false;
  /** Летить угору від стрибка і ще не відпускала кнопку: відпустить — підйом обріжеться. */
  let jumpRising = false;
  /** Горизонтальна швидкість по землі, м/с: у повітрі змінюється м'яко. */
  let hx = 0;
  let hz = 0;
  let lastSafe: Vec3 = { ...spawn };
  const rayDown = (from: Vec3, max: number): number => {
    const hit = world.castRay(new rapier.Ray(from, { x: 0, y: -1, z: 0 }), max, true, undefined, groups(0xffff, SOLID_GROUP));
    return hit ? hit.timeOfImpact : max;
  };
  /** Те саме, але рухома платформа не лічиться землею: це не надійне місце для повернення. */
  const rayDownStill = (from: Vec3, max: number): number => {
    const hit = world.castRay(new rapier.Ray(from, { x: 0, y: -1, z: 0 }), max, true, undefined, groups(0xffff, SOLID_GROUP));
    return hit && !moverHandles.has(hit.collider.handle) ? hit.timeOfImpact : max;
  };
  /** Платформа, на якій Софійка стоїть: промінь униз із підошов влучає в її колайдер. */
  const moverUnderfoot = (): (typeof moverBodies)[number] | null => {
    const from = { x: sofiyka.position.x, y: sofiyka.position.y + FOOT_LIFT, z: sofiyka.position.z };
    const hit = world.castRay(new rapier.Ray(from, { x: 0, y: -1, z: 0 }), FOOT_LIFT + FOOT_REACH, true, undefined, groups(0xffff, SOLID_GROUP));
    return hit ? (moverBodies.find((m) => m.handle === hit.collider.handle) ?? null) : null;
  };
  let blinkHeld = false;
  let strikeHeld = false;
  /** Удар: с від початку, і кого він уже зачепив. `null` — Удару немає. */
  let strike: StrikeRun | null = null;

  const spawns = level.enemies ?? [];
  type Enemy = { kind: 'bee'; bee: BeeInternal } | { kind: 'turtle'; turtle: TurtleInternal };
  const freshEnemies = (): Enemy[] =>
    spawns.map((e): Enemy =>
      e.kind === 'bee'
        ? { kind: 'bee', bee: createBee(e.id, e.position, e.facing, tuning.hitsToDefeat.bee) }
        : { kind: 'turtle', turtle: createTurtle(e.id, e.position, e.facing, tuning.hitsToDefeat.turtle) },
    );
  let enemies = freshEnemies();
  /** Відкидання: горизонтальний напрямок (одиничний) і скільки секунд ще триває. */
  let knockback: { x: number; z: number; remaining: number } | null = null;
  let hurt = 0;
  /** Удар ворога відкинув її, і вона ще не стала на землю: падіння в прірву тоді не коштує Серця. */
  let thrown = false;
  let slowdownBook = createSlowdownBook();
  const rayDistance = (from: Vec3, dir: Vec3, max: number): number => {
    const hit = world.castRay(new rapier.Ray(from, dir), max, true, undefined, groups(0xffff, SOLID_GROUP));
    return hit ? hit.timeOfImpact : max;
  };
  const center = (): Vec3 => ({ x: sofiyka.position.x, y: sofiyka.position.y + centerOffset, z: sofiyka.position.z });
  /** Відстань від точки до осі капсули Софійки. */
  const distanceToAxis = (p: Vec3): number => {
    const lo = sofiyka.position.y + r;
    const hi = sofiyka.position.y + tuning.capsuleHeight - r;
    const y = Math.min(hi, Math.max(lo, p.y));
    return Math.hypot(p.x - sofiyka.position.x, p.y - y, p.z - sofiyka.position.z);
  };

  /** Ставить Софійку на `checkpoint` і скидає все, що тягнулося з попереднього місця: Вікно, відкидання, Удар. */
  function settleAtCheckpoint(events: SimEvent[]): void {
    teleportTo(checkpoint);
    knockback = null;
    hurt = 0;
    thrown = false;
    strike = null;
    if (slowdownBook.slowdown.open) events.push({ type: 'windowClosed', reflexed: false });
    slowdownBook = closeSlowdown(slowdownBook);
  }

  function respawn(events: SimEvent[]): void {
    settleAtCheckpoint(events);
    sofiyka.hearts = tuning.hearts;
    sofiyka.invulnerable = 0;
    lastSafe = { ...checkpoint };
    enemies = freshEnemies();
    if (!sourceBroken) sourceHp = tuning.hitsToDefeat.source; // ціле Джерело відновлюється; розбите лишається, Ключ лежить
    slowdownBook = createSlowdownBook();
    events.push({ type: 'respawned' });
  }

  /** Вороги крокують за новим положенням Софійки; влучання ворога в Софійку. */
  function stepEnemies(dt: number, events: SimEvent[]): boolean {
    const hits: Vec3[] = [];
    const ground = { rayDown, rayDistance };
    enemies = enemies.map((enemy): Enemy => {
      if (enemy.kind === 'bee') {
        const out = stepBee(enemy.bee, center(), dt, rayDistance, tuning);
        if (out.events.includes('windupStarted')) events.push({ type: 'enemyWindup', id: enemy.bee.id });
        if (out.bee.state === 'DASH' && distanceToAxis(out.bee.position) < tuning.bee.radius + r) {
          hits.push({ ...out.bee.position });
          return { kind: 'bee', bee: stickBee(out.bee) };
        }
        return { kind: 'bee', bee: out.bee };
      }
      const out = stepTurtle(enemy.turtle, sofiyka.position, dt, ground, tuning);
      if (out.events.includes('windupStarted')) events.push({ type: 'enemyWindup', id: enemy.turtle.id });
      const t = out.turtle;
      const reach = Math.hypot(sofiyka.position.x - t.position.x, sofiyka.position.z - t.position.z);
      // Один оберт б'є щонайбільше раз; по невразливій не лічиться.
      const level = Math.abs(sofiyka.position.y - t.position.y) <= tuning.turtle.reachHeight;
      if (t.state === 'SPIN' && !t.spinLanded && reach < tuning.turtle.spinReach && level && sofiyka.invulnerable <= 0) {
        hits.push({ ...t.position });
        return { kind: 'turtle', turtle: { ...t, spinLanded: true } };
      }
      return { kind: 'turtle', turtle: t };
    });
    for (const from of hits) {
      if (sofiyka.invulnerable > 0) break;
      if (damageSofiyka('hit', events, from)) return true;
    }
    return false;
  }

  /** Удар, що торкнувся цілого Джерела, віднімає один Удар (раз за замах); на нулі казан розбито й випав Ключ. */
  function strikeSource(s: StrikeRun, events: SimEvent[]): boolean {
    if (!sourceSpawn || sourceBroken || s.touched.has(sourceSpawn.id)) return false;
    if (!strikeHitsSource(strikeCenter(sofiyka, tuning), tuning.strikeRadius, sourceSpawn, tuning)) return false;
    s.touched.add(sourceSpawn.id);
    sourceHp -= 1;
    events.push({ type: 'sourceStruck', hp: sourceHp });
    if (sourceHp <= 0) {
      sourceBroken = true;
      world.removeRigidBody(sourceCollider!.parent()!);
      keyAt = keyDropAt(sourceSpawn, sofiyka.position, tuning);
      events.push({ type: 'sourceBroken' });
    }
    return true;
  }

  /** Ключ, що лежить, підбирається сам, коли Софійка ближче за `pickupRadius` (по xz). */
  function stepKey(events: SimEvent[]): void {
    if (!keyAt) return;
    const near = Math.hypot(sofiyka.position.x - keyAt.x, sofiyka.position.z - keyAt.z) < tuning.source.pickupRadius;
    if (!near || Math.abs(sofiyka.position.y - keyAt.y) > tuning.capsuleHeight) return;
    keyAt = null;
    sofiyka.keys += 1;
    events.push({ type: 'keyPicked' });
  }

  /** Хітбокс Удару діє між `strikeActiveFrom` і `strikeActiveTo`; кожного ворога вражає раз. */
  function strikeEnemies(s: StrikeRun, events: SimEvent[]): void {
    if (s.time < tuning.strikeActiveFrom - 1e-9 || s.time > tuning.strikeActiveTo + 1e-9) return;
    const first = !s.reported;
    s.reported = true;
    let touchedNow = strikeSource(s, events);
    const hit = new Set<string>();
    for (const e of publicEnemies()) {
      if (s.touched.has(e.id)) continue;
      const result = strikeHits(sofiyka, e, tuning);
      if (result === 'miss') continue;
      touchedNow = true;
      // Заблокований ворог ще може стати вразливим у тому ж Ударі (Бджола застрягла); «дзень» — один раз.
      if (result === 'blocked') {
        if (!s.blocked.has(e.id)) events.push({ type: 'struck', enemyId: e.id, hit: false });
        s.blocked.add(e.id);
        continue;
      }
      s.touched.add(e.id);
      events.push({ type: 'struck', enemyId: e.id, hit: true });
      hit.add(e.id);
    }
    if (first && !touchedNow) events.push({ type: 'struck', enemyId: null, hit: false });
    const defeated = new Set<string>();
    enemies = enemies.flatMap((e): Enemy[] => {
      const id = e.kind === 'bee' ? e.bee.id : e.turtle.id;
      if (!hit.has(id)) return [e];
      const hp = (e.kind === 'bee' ? e.bee.hp : e.turtle.hp) - 1;
      if (hp <= 0) {
        defeated.add(id);
        return [];
      }
      return [e.kind === 'bee' ? { kind: 'bee', bee: { ...e.bee, hp } } : { kind: 'turtle', turtle: { ...e.turtle, hp } }];
    });
    for (const id of defeated) events.push({ type: 'enemyDefeated', id });
    if (defeated.has(slowdownBook.slowdown.enemyId ?? '')) {
      slowdownBook = closeSlowdown(slowdownBook);
      events.push({ type: 'windowClosed', reflexed: false });
    }
  }

  /** Квітки розкриваються й закриваються; стрибок у розкритий бутон — подія, і Софійка стає на Контрольну точку (якщо Квітка не веде в інший світ). */
  function stepFlowers(prevSolesY: number, dt: number, events: SimEvent[]): void {
    for (const flower of flowerSpawns) {
      const distance = Math.hypot(sofiyka.position.x - flower.position.x, sofiyka.position.z - flower.position.z);
      const opens = flower.opens && (flower.opensWhen !== 'keyHeld' || sofiyka.keys >= 1);
      const now = stepFlower(openness.get(flower.id) ?? 0, opens, distance, dt, tuning);
      openness.set(flower.id, now);
      if (!entersFlower(prevSolesY, sofiyka, flower, now, tuning)) continue;
      events.push({ type: 'flowerEntered', id: flower.id });
      if (!flower.to) settleAtCheckpoint(events); // Квітка в інший світ нікуди не ставить: світ змінить `Game`
      return;
    }
  }

  /** Софійка з Ключем біля справжньої закритої Клітки відкриває її: двері зникають, Контрольна точка — перед ними. */
  function stepCages(events: SimEvent[]): void {
    if (sofiyka.keys < 1) return;
    const half = tuning.village.cageSize / 2;
    for (const cage of cageSpawns) {
      if (!cage.working || openCages.has(cage.id)) continue;
      const gapX = Math.max(0, Math.abs(sofiyka.position.x - cage.position.x) - half);
      const gapZ = Math.max(0, Math.abs(sofiyka.position.z - cage.position.z) - half);
      if (Math.hypot(gapX, gapZ) > tuning.village.cageOpenRadius) continue;
      sofiyka.keys -= 1;
      openCages.add(cage.id);
      const door = doors.get(cage.id);
      if (door) world.removeRigidBody(door.parent()!);
      checkpoint = {
        x: cage.position.x + Math.sin(cage.facing) * tuning.village.cageCheckpointDistance,
        y: cage.position.y,
        z: cage.position.z + Math.cos(cage.facing) * tuning.village.cageCheckpointDistance,
      };
      events.push({ type: 'cageOpened', id: cage.id });
      events.push({ type: 'sliceComplete' }); // справжню Клітку відкрито Ключем — Зріз пройдено
      return;
    }
  }

  /** Мінус Серце. Для удару ворога — відкидання від `from` і HURT. Нуль Сердець — Відродження. */
  function damageSofiyka(cause: 'fall' | 'hit', events: SimEvent[], from?: Vec3): boolean {
    sofiyka.hearts -= 1;
    sofiyka.invulnerable = tuning.invulnerableSeconds;
    events.push({ type: 'heartLost', cause });
    if (cause === 'hit' && from) {
      const dx = sofiyka.position.x - from.x;
      const dz = sofiyka.position.z - from.z;
      const len = Math.hypot(dx, dz);
      const dir = len > 1e-3 ? { x: dx / len, z: dz / len } : { x: -Math.sin(sofiyka.facing), z: -Math.cos(sofiyka.facing) };
      knockback = { ...dir, remaining: tuning.knockbackSeconds };
      hurt = tuning.hurtSeconds;
      thrown = true;
    }
    if (sofiyka.hearts > 0) return false;
    respawn(events);
    return true;
  }

  /**
   * Обхід вади контролера персонажа в Rapier 0.21: на діагоналі квадратного блока (x - cx = z - cz)
   * він не зупиняє капсулу, і вона тоне в підлогу. Промінь униз від центру капсули повертає її на землю.
   */
  function liftOutOfGround(): void {
    const t = body.translation();
    const hit = world.castRay(
      new rapier.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 }),
      centerOffset + 0.3,
      true,
      undefined,
      groups(0xffff, SOLID_GROUP | BARS_GROUP),
    );
    if (hit && hit.timeOfImpact < centerOffset - 0.01) {
      const lift = centerOffset - hit.timeOfImpact;
      body.setTranslation({ x: t.x, y: t.y + lift, z: t.z }, true);
    }
  }

  /** Ставить Софійку на місце без наслідків руху: швидкість нуль, стоїть на землі, приземлення не буде. */
  function teleportTo(to: Vec3): void {
    const center = { x: to.x, y: to.y + centerOffset, z: to.z };
    body.setTranslation(center, true);
    body.setNextKinematicTranslation(center);
    world.step(); // колайдер переїжджає лише після кроку світу
    sofiyka.position = { ...to };
    sofiyka.velocityY = 0;
    sofiyka.grounded = true;
    sofiyka.jumpsUsed = 0;
    airSeconds = 0;
    jumpBuffer = 0;
    queuedJump = false;
    jumpRising = false;
  }

  function syncPosition(): void {
    const t = body.translation();
    sofiyka.position = { x: t.x, y: t.y - centerOffset, z: t.z };
  }

  return {
    step(rawInput) {
      const dt = tuning.step;
      // Перетворення: у рівні з `intro` перші `introSeconds` правила не бачать натискань.
      const input = level.intro && time < tuning.worlds.introSeconds - 1e-9 ? NO_INPUT : rawInput;
      const events: SimEvent[] = [];
      const prevSolesY = sofiyka.position.y;

      // 0. Рухомі платформи їдуть першими; платформа, на якій вона стоїть, везе її на свій зсув за крок.
      const riding = sofiyka.grounded ? moverUnderfoot() : null;
      let carry: Vec3 = { x: 0, y: 0, z: 0 };
      for (const m of moverBodies) {
        const from = moverAt(m.spawn, time);
        const to = moverAt(m.spawn, time + dt);
        m.body.setTranslation(to, true);
        if (m === riding) carry = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
      }

      const len = Math.hypot(input.moveX, input.moveZ);
      const scale = len > 1 ? 1 / len : 1;
      const dx = input.moveX * scale;
      const dz = input.moveZ * scale;
      const moving = len > 1e-6;
      if (moving && hurt <= 0) sofiyka.facing = Math.atan2(dx, dz);

      // 1. Таймери.
      sofiyka.blinkCooldown = Math.max(0, sofiyka.blinkCooldown - dt);
      sofiyka.invulnerable = Math.max(0, sofiyka.invulnerable - dt);
      hurt = Math.max(0, hurt - dt);

      // 2. Натиски за фронтом.
      const blinkPressed = input.blink && !blinkHeld;
      blinkHeld = input.blink;
      let blinked = false;
      const slowdownNow = slowdownBook.slowdown;
      if (blinkPressed && slowdownNow.open) {
        // У Вікні Shift — Рефлекс; якщо місця за ворогом немає, нічого не відбувається.
        const enemy = publicEnemies().find((e) => e.id === slowdownNow.enemyId);
        const from = { ...sofiyka.position };
        const to = enemy ? resolveReflex(world, rayDown, enemy, from, tuning, sofiyka.facing) : null;
        if (enemy && to) {
          body.setNextKinematicTranslation({ x: to.x, y: to.y + centerOffset, z: to.z });
          world.step();
          syncPosition();
          sofiyka.velocityY = 0;
          sofiyka.facing = Math.atan2(enemy.position.x - to.x, enemy.position.z - to.z);
          sofiyka.invulnerable = tuning.reflexInvulnerableSeconds;
          knockback = null;
          hurt = 0;
          blinked = true;
          slowdownBook = closeSlowdown(slowdownBook);
          events.push({ type: 'reflexed', enemyId: enemy.id, from, to: { ...to } });
          events.push({ type: 'windowClosed', reflexed: true });
        }
      } else if (blinkPressed && sofiyka.blinkCooldown <= 1e-6) {
        const from = { ...sofiyka.position };
        const to = resolveBlink(world, from, sofiyka.facing, tuning);
        if (to) {
          body.setNextKinematicTranslation({ x: to.x, y: to.y + centerOffset, z: to.z });
          world.step();
          syncPosition();
          sofiyka.velocityY = 0;
          sofiyka.blinkCooldown = tuning.blinkCooldown;
          knockback = null;
          blinked = true;
          events.push({ type: 'blinked', from, to });
        }
      }

      const jumpPressed = input.jump && !jumpHeld;
      jumpHeld = input.jump;
      const strikePressed = input.strike && !strikeHeld;
      strikeHeld = input.strike;
      if (strike) {
        strike.time += dt;
        if (strike.time >= tuning.strikeSeconds - 1e-9) strike = null;
      }
      if (strikePressed && !strike && !blinked && hurt <= 0) strike = { time: 0, touched: new Set(), blocked: new Set(), reported: false };
      // 3. Рух Софійки. Крок Blink рух пропускає.
      if (!blinked) {
        let jumpedNow = false;
        const onGround = sofiyka.grounded;
        jumpBuffer = Math.max(0, jumpBuffer - dt);
        // Перший стрибок: з землі або в межах «койота». Зійшла з краю й пізно — лишається один стрибок у повітрі.
        const firstJump = sofiyka.jumpsUsed === 0 && (onGround || airSeconds <= tuning.coyoteSeconds + 1e-9);
        const canJump = sofiyka.jumpsUsed < 2 && (firstJump || sofiyka.jumpsUsed === 1 || !onGround);
        if ((jumpPressed || queuedJump) && canJump) {
          const double = !firstJump;
          const height = double ? tuning.doubleJumpHeight : tuning.jumpHeight;
          sofiyka.velocityY = Math.sqrt(2 * tuning.jumpGravityUp * height);
          sofiyka.jumpsUsed = double ? 2 : 1;
          sofiyka.grounded = false;
          jumpedNow = true;
          jumpRising = true;
          jumpBuffer = 0;
          events.push({ type: 'jumped', double });
        } else if (jumpPressed) {
          jumpBuffer = tuning.jumpBufferSeconds;
        }
        queuedJump = false;
        if (!jumpedNow) {
          if (sofiyka.grounded) {
            sofiyka.velocityY = 0;
          } else {
            let vy = sofiyka.velocityY;
            // Відпустила кнопку на підйомі: стрибок нижчий (один раз).
            if (jumpRising && !input.jump && vy > 0) {
              vy *= tuning.jumpCutFactor;
              jumpRising = false;
            }
            let g = vy > 0 ? tuning.jumpGravityUp : tuning.jumpGravityDown;
            if (Math.abs(vy) < tuning.jumpHangSpeed) g *= tuning.jumpHangFactor;
            sofiyka.velocityY = vy - g * dt;
          }
        }
        const wasGrounded = sofiyka.grounded;

        // Відкидання і HURT забирають керування рухом.
        const wantX = hurt > 0 ? 0 : dx * tuning.walkSpeed;
        const wantZ = hurt > 0 ? 0 : dz * tuning.walkSpeed;
        if (onGround || hurt > 0 || knockback) {
          hx = wantX;
          hz = wantZ;
        } else {
          // У повітрі швидкість наздоганяє бажану не одразу.
          hx += (wantX - hx) * tuning.airControl;
          hz += (wantZ - hz) * tuning.airControl;
        }
        let moveX = hx * dt;
        let moveZ = hz * dt;
        if (knockback) {
          const share = Math.min(dt, knockback.remaining);
          const speed = tuning.knockbackDistance / tuning.knockbackSeconds;
          moveX = knockback.x * speed * share;
          moveZ = knockback.z * speed * share;
          knockback.remaining -= dt;
          if (knockback.remaining <= 1e-9) knockback = null;
        }
        const current = body.translation();
        controller.computeColliderMovement(collider, {
          x: moveX + carry.x,
          y: sofiyka.velocityY * dt - (sofiyka.grounded ? 0.01 : 0) + carry.y,
          z: moveZ + carry.z,
        });
        const m = controller.computedMovement();
        body.setNextKinematicTranslation({ x: current.x + m.x, y: current.y + m.y, z: current.z + m.z });
        world.step();
        // Головою в стелю: вгору далі не летимо.
        if (sofiyka.velocityY > 0 && m.y < sofiyka.velocityY * dt - 0.001) sofiyka.velocityY = 0;
        sofiyka.grounded = !jumpedNow && controller.computedGrounded();
        if (sofiyka.grounded) liftOutOfGround();
        syncPosition();

        airSeconds = sofiyka.grounded ? 0 : airSeconds + dt;
        if (!wasGrounded && sofiyka.grounded) {
          sofiyka.jumpsUsed = 0;
          sofiyka.velocityY = 0;
          jumpRising = false;
          if (jumpBuffer > 1e-9) queuedJump = true;
          jumpBuffer = 0;
          events.push({ type: 'landed' });
        }
      }
      if (sofiyka.grounded && isSafeSpot(rayDownStill, sofiyka.position)) lastSafe = { ...sofiyka.position };
      if (sofiyka.grounded && !knockback) thrown = false;

      // 4–5. Вороги крокують і б'ють.
      const respawnedByHit = stepEnemies(dt, events);

      // 5. Удар по ворогах.
      if (!respawnedByHit && strike) strikeEnemies(strike, events);

      // 6. Вікно.
      if (!respawnedByHit) {
        const out = stepSlowdown(slowdownBook, publicEnemies(), sofiyka.position, dt, sofiyka.invulnerable <= 0, tuning);
        slowdownBook = out.book;
        if (out.opened) events.push({ type: 'windowOpened', enemyId: out.opened });
        if (out.expired) events.push({ type: 'windowClosed', reflexed: false });
      }

      // 6а. Ключ підбирається, Квітки розкриваються, стрибок у бутон, Клітки.
      stepKey(events);
      stepFlowers(prevSolesY, dt, events);
      stepCages(events);

      // 7. Падіння, повернення, Відродження.
      if (sofiyka.position.y < level.killY) {
        // Падіння коштує Серце, якщо вона не невразлива; без Сердець — Відродження на старті.
        const respawned = sofiyka.invulnerable <= 0 && !thrown && damageSofiyka('fall', events);
        thrown = false;
        if (!respawned) {
          teleportTo(lastSafe);
          knockback = null;
          events.push({ type: 'returned', to: { ...lastSafe } });
        }
      }

      if (hurt > 0) strike = null;
      sofiyka.mode = hurt > 0 ? 'HURT' : blinked ? 'BLINK' : strike ? 'ATTACK' : !sofiyka.grounded ? 'JUMP' : moving ? 'RUN' : 'IDLE';
      time += dt;
      return events;
    },
    get sofiyka() {
      return sofiyka;
    },
    get time() {
      return time;
    },
    get enemies() {
      return publicEnemies();
    },
    get timeScale() {
      return slowdownBook.slowdown.open ? tuning.slowdownTimeScale : 1;
    },
    get slowdown() {
      return { ...slowdownBook.slowdown };
    },
    get cages() {
      return cageSpawns.map((c): CageState => ({ id: c.id, open: openCages.has(c.id), working: c.working }));
    },
    get flowers() {
      return flowerSpawns.map((f): FlowerState => ({ id: f.id, openness: openness.get(f.id) ?? 0 }));
    },
    get movers() {
      return moverBodies.map((m) => ({ id: m.spawn.id, position: moverAt(m.spawn, time) }));
    },
    get source() {
      return sourceSpawn ? { hp: sourceHp, broken: sourceBroken, keyAt: keyAt ? { ...keyAt } : null } : null;
    },
    get checkpoint() {
      return { ...checkpoint };
    },
    rayDistance,
    dispose() {
      world.free();
    },
  } satisfies Sim;

  function publicEnemies(): EnemyState[] {
    return enemies.map((e): EnemyState => {
      const x = e.kind === 'bee' ? e.bee : e.turtle;
      return {
        id: x.id,
        kind: e.kind,
        position: { ...x.position },
        facing: x.facing,
        state: x.state,
        stateTime: x.stateTime,
        attacking: x.state === 'WINDUP' || x.state === 'DASH' || x.state === 'SPIN',
        vulnerable: x.state === 'STUCK',
        hp: x.hp,
      };
    });
  }
}
