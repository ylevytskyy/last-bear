import { Mesh, type Object3D, type Scene } from 'three';
import { animateBear } from '../entities/bear/animate';
import { buildBear, disposeBear, type BearRig } from '../entities/bear/build-bear';
import { CAPTIVE_SKIN, SURVIVOR_SKIN } from '../entities/bear/skins';
import type { Level } from '../sim/level';
import type { Sim } from '../sim/sim';
import { TUNING, type Tuning } from '../sim/tuning';
import type { Bloom } from './bloom';
import { addOutline } from '../entities/toon';
import { buildCage, buildHouse, cageDoorAngle, type CageModel, type HouseModel } from './village-models';
import { buildFlower, type FlowerModel } from './flower-models';
import { happyHop, petalAngle } from './flower-pose';
import { createActor, hasActor, type Actor } from './glb-actors';

export type VillageView = {
  /** Скільки моделей Селища в сцені (для перевірок у браузері). */
  counts(): { houses: number; cages: number; bears: number };
  /** Для перевірок: розкриття й кут пелюсток кожної Квітки, кут дверей і підскок Полоненого кожної Клітки. */
  state(): { flowers: Record<string, { openness: number; petal: number }>; cages: Record<string, { door: number; hop: number }> };
  /** Позиція ліхтаря Вцілілого у світі, якщо він є. */
  lanternAt(): { x: number; y: number; z: number } | null;
  frame(dt?: number): void;
  /** Скільки сіток у сцені від Селища. */
  meshCount(): number;
  /** Прибирає моделі зі сцени й звільняє їх. */
  dispose(): void;
};

/** З якої відстані Вцілілий показує дорогу, м. */
const SURVIVOR_TALK_RANGE = 8;
/** З якої відстані Полонений кличе на допомогу, м. */
const CAPTIVE_CALL_RANGE = 7;
/** Сторона основи Клітки в `captive-cub-cage.glb`, м. */
const CAGE_MODEL_SIZE = 1.5;

/** Будиночки (блоки `look: 'house'`), Клітки з Полоненими і Вцілілий. Порожньо, якщо рівень їх не має. */
export function createVillageView(scene: Scene, bloom: Pick<Bloom, 'mark'>, sim: Sim, level: Level, tuning: Tuning = TUNING): VillageView {
  const roots: Object3D[] = [];
  const addRoot = (o: Object3D) => {
    scene.add(o);
    roots.push(o);
  };
  const houses: HouseModel[] = [];
  for (const b of level.blocks) {
    if (b.look !== 'house') continue;
    const house = buildHouse(b.halfExtents);
    house.root.position.set(b.center.x, b.center.y, b.center.z);
    addRoot(house.root);
    houses.push(house);
  }

  const bears: BearRig[] = [];
  type CageView = { model?: CageModel; captive?: BearRig; actor?: Actor; at: { x: number; z: number }; openedAt: number | null };
  const cages = new Map<string, CageView>();
  for (const spawn of level.cages ?? []) {
    if (hasActor('cage')) {
      // Клітка з Ведмежам в одному файлі (`captive-cub-cage.glb`): габарит 1.5 м розтягнуто до куба правил.
      const actor = createActor('cage', { scale: tuning.village.cageSize / CAGE_MODEL_SIZE, outline: 0.012 });
      actor.root.position.set(spawn.position.x, spawn.position.y, spawn.position.z);
      actor.root.rotation.y = spawn.facing;
      if (spawn.working) {
        for (const lock of actor.meshesOf('MAT_Lock_Gold')) bloom.mark(lock);
      } else {
        actor.show('Golden_Heart_Lock', false); // Клітка без замка (не потребує Ключа)
      }
      actor.play('Cage_Locked_Idle', { layer: 'cage', fade: 0 });
      actor.play('Cub_Captive_Sad', { layer: 'cub', fade: 0 });
      addRoot(actor.root);
      cages.set(spawn.id, { actor, at: spawn.position, openedAt: null });
      continue;
    }
    const model = buildCage(spawn.working, tuning.village.cageSize);
    model.root.position.set(spawn.position.x, spawn.position.y, spawn.position.z);
    model.root.rotation.y = spawn.facing;
    if (model.lockMaterial) {
      const lock = model.root.getObjectByName('lock');
      if (lock) bloom.mark(lock);
    }
    const captive = buildBear(CAPTIVE_SKIN);
    captive.root.scale.setScalar(0.8);
    // За ґратами тіні Полонених не видно, а кожна сітка з тінню — ще один виклик малювання.
    captive.root.traverse((o) => (o.castShadow = false));
    model.root.add(captive.root); // у центрі Клітки, дивиться крізь двері
    addRoot(model.root);
    bears.push(captive);
    cages.set(spawn.id, { model, captive, at: spawn.position, openedAt: null });
  }

  const flowers = new Map<string, FlowerModel>();
  for (const spawn of level.flowers ?? []) {
    const model = buildFlower(spawn.color, tuning);
    model.root.position.set(spawn.position.x, spawn.position.y, spawn.position.z);
    // Модель-тюльпан світить лише серцевиною-порталом: позначати в ній сітку для сяйва не можна, засяють і пелюстки.
    const pollen = model.actor ? null : model.root.getObjectByName('pollen');
    if (pollen) bloom.mark(pollen);
    addRoot(model.root);
    flowers.set(spawn.id, model);
  }
  const flowerState: Record<string, { openness: number; petal: number }> = {};
  const cageState: Record<string, { door: number; hop: number }> = {};

  /** Вцілілий: модель з анімацією (`survivor.glb`) або, якщо вона не завантажилась, ведмідь з примітивів. */
  let survivor: BearRig | null = null;
  let survivorActor: Actor | null = null;
  if (level.survivor) {
    const at = level.survivor.position;
    if (hasActor('survivor')) {
      survivorActor = createActor('survivor', { outline: 0.014 });
      survivorActor.root.position.set(at.x, at.y, at.z);
      survivorActor.root.rotation.y = level.survivor.facing;
      for (const core of survivorActor.meshesOf('MAT_Lantern_Core')) bloom.mark(core);
      addRoot(survivorActor.root);
    } else {
      survivor = buildBear(SURVIVOR_SKIN);
      survivor.root.getObjectByName('lantern')?.traverse((o) => (o.userData['noOutline'] = true));
      addOutline(survivor.root);
      survivor.root.position.set(at.x, at.y, at.z);
      survivor.root.rotation.y = level.survivor.facing;
      const lantern = survivor.root.getObjectByName('lantern');
      if (lantern) bloom.mark(lantern);
      addRoot(survivor.root);
      bears.push(survivor);
    }
  }

  return {
    state: () => ({ flowers: { ...flowerState }, cages: { ...cageState } }),
    counts: () => ({ houses: houses.length, cages: cages.size, bears: bears.length }),
    lanternAt() {
      const lantern = survivorActor?.bone('lantern_pivot') ?? survivor?.root.getObjectByName('lantern');
      if (!lantern) return null;
      lantern.updateWorldMatrix(true, false);
      const e = lantern.matrixWorld.elements;
      return { x: e[12]!, y: e[13]!, z: e[14]! };
    },
    frame(dt = 0) {
      const t = sim.time;
      if (survivorActor && level.survivor) {
        // Вцілілий показує дорогу, поки Софійка поруч; далі стоїть.
        const me = sim.sofiyka.position;
        const at = level.survivor.position;
        const near = Math.hypot(me.x - at.x, me.z - at.z) < SURVIVOR_TALK_RANGE;
        survivorActor.play(near ? 'Point_Direction' : 'Idle', { fade: 0.25 });
        survivorActor.update(dt * sim.timeScale);
      }
      // Спершу дихання (воно ставить висоту кореня), потім підскок Полоненого поверх нього.
      for (const [i, b] of bears.entries()) animateBear(b, t + i * 0.7);
      for (const c of sim.cages) {
        const view = cages.get(c.id);
        if (!view) continue;
        if (c.open && view.openedAt === null) view.openedAt = t;
        const since = view.openedAt === null ? 0 : t - view.openedAt;
        const door = cageDoorAngle(c.open, since);
        const hop = c.open ? happyHop(since) : 0;
        if (view.actor) {
          // Двері, замок і радість Ведмежа грають кліпи; `door` у стані лишається для перевірок.
          const me = sim.sofiyka.position;
          const near = Math.hypot(me.x - view.at.x, me.z - view.at.z) < CAPTIVE_CALL_RANGE;
          view.actor.play(c.open ? 'Cage_Unlock_Open' : 'Cage_Locked_Idle', { layer: 'cage', once: c.open, fade: 0.05 });
          view.actor.play(c.open ? 'Cub_Rescued_Celebrate' : near ? 'Cub_Captive_CallHelp' : 'Cub_Captive_Sad', { layer: 'cub', fade: 0.25 });
          view.actor.update(dt * sim.timeScale);
        } else if (view.model && view.captive) {
          view.model.door.rotation.y = -door;
          view.captive.root.position.y = hop;
        }
        cageState[c.id] = { door, hop };
      }
      for (const f of sim.flowers) {
        const model = flowers.get(f.id);
        if (!model) continue;
        model.setOpenness(f.openness);
        flowerState[f.id] = { openness: f.openness, petal: petalAngle(f.openness) };
      }

    },
    meshCount() {
      let n = 0;
      for (const r of roots) r.traverse((x) => (x instanceof Mesh ? n++ : undefined));
      return n;
    },
    dispose() {
      for (const r of roots) scene.remove(r);
      for (const h of houses) h.dispose();
      for (const c of cages.values()) {
        c.model?.dispose();
        c.actor?.dispose();
      }
      for (const f of flowers.values()) f.dispose();
      for (const b of bears) disposeBear(b);
      survivorActor?.dispose();
    },
  };
}
