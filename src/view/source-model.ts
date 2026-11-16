import { toonMaterial } from '../entities/toon';
import { createActor, hasActor, type Actor } from './glb-actors';
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshToonMaterial, SphereGeometry, TorusGeometry, type Object3D } from 'three';

/** Вигляд Джерела за станом: тріщин стільки, скільки було Ударів; зілля тьмяніє. */
export function sourceLook(hp: number, maxHp: number): { cracks: number; brew: number } {
  const hits = Math.max(0, Math.min(maxHp, maxHp - hp));
  return { cracks: hits, brew: 1 - (0.75 * hits) / maxHp };
}

export type SourceModel = {
  root: Group;
  cracks: Object3D[];
  brewMaterial: MeshToonMaterial;
  /** Світні частини для `bloom.mark`. */
  glow: Object3D[];
  apply(look: { cracks: number; brew: number }): void;
  /** Удар по казану: коротке тремтіння (лише з моделлю `cauldron-source.glb`). */
  hit(): void;
  /** Казан розбито: кліп розколу й вильоту Ключа, потім уламки лежать (лише з моделлю). */
  shatter(): void;
  /** Крок анімації. Без моделі нічого не робить. */
  update(dt: number): void;
  dispose(): void;
};

/** Скільки триває тремтіння після удару, с (кліп `Cauldron_Hit_Shake` — 15 кадрів по 30). */
const SHAKE_SECONDS = 0.5;
/** Масштаб моделі: габарит 1.2 x 1.0 м → куб правил 2.0 x 1.6 м. */
const CAULDRON_SCALE = 1.6;

/** Казан-Джерело з `cauldron-source.glb`. Ключ, що лежить у зіллі моделі, сховано: Ключ у грі окремий (`buildKey`). */
function buildSourceActor(): SourceModel {
  const actor: Actor = createActor('cauldron', { scale: CAULDRON_SCALE, outline: 0.012 });
  const crackNames = ['Crack_Stage_1', 'Crack_Stage_2', 'Crack_Stage_3'];
  for (const name of crackNames) actor.show(name, false);
  const hiddenKey = actor.material('MAT_Key_Gold');
  if (hiddenKey) hiddenKey.visible = false;
  const brewMaterial = actor.material('MAT_Potion_Purple')!;
  const brewFull = brewMaterial.emissiveIntensity;
  let shake = 0;
  let broken = false;
  actor.play('Cauldron_Bubble_Idle', { fade: 0 });
  return {
    root: actor.root,
    cracks: crackNames.map((n) => actor.bone(n)!),
    brewMaterial,
    glow: crackNames.map((n) => actor.bone(n)!),
    apply(look) {
      crackNames.forEach((n, i) => actor.show(n, i < look.cracks));
      brewMaterial.emissiveIntensity = brewFull * look.brew;
    },
    hit() {
      shake = SHAKE_SECONDS;
    },
    shatter() {
      broken = true;
      actor.play('Cauldron_Shatter', { once: true, fade: 0.05 });
    },
    update(dt) {
      if (!broken) {
        shake = Math.max(0, shake - dt);
        if (shake > 0) actor.play('Cauldron_Hit_Shake', { once: true, fade: 0.05 });
        else actor.play('Cauldron_Bubble_Idle', { fade: 0.15 });
      }
      actor.update(dt);
    },
    dispose: actor.dispose,
  };
}

/** Великий фіолетовий казан на ніжках зі світним зіллям. Земля під центром — (0,0,0). */
export function buildSource(): SourceModel {
  if (hasActor('cauldron')) return buildSourceActor();
  const root = new Group();
  root.name = 'source';
  const iron = toonMaterial({ color: '#4b2a6b', roughness: 0.5, metalness: 0.4, flatShading: true });
  const brewMaterial = toonMaterial({ color: '#c77dff', emissive: '#b05cff', emissiveIntensity: 2.5 });
  const crackMaterial = toonMaterial({ color: '#ffe3ff', emissive: '#ff9cff', emissiveIntensity: 2 });
  const potGeo = new SphereGeometry(1.0, 16, 12, 0, Math.PI * 2, Math.PI * 0.25, Math.PI * 0.75);
  const pot = new Mesh(potGeo, iron);
  pot.position.y = 0.95;
  pot.castShadow = true;
  const rimGeo = new TorusGeometry(0.72, 0.09, 8, 24);
  const rim = new Mesh(rimGeo, iron);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.65;
  const brewGeo = new CylinderGeometry(0.68, 0.68, 0.08, 24);
  const brew = new Mesh(brewGeo, brewMaterial);
  brew.position.y = 1.6;
  const legGeo = new CylinderGeometry(0.08, 0.1, 0.4, 6);
  for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
    const leg = new Mesh(legGeo, iron);
    leg.position.set(Math.sin(a) * 0.6, 0.2, Math.cos(a) * 0.6);
    root.add(leg);
  }
  const crackGeo = new BoxGeometry(0.06, 0.7, 0.04);
  const cracks: Object3D[] = [0.4, 2.3, 4.2].map((a, i) => {
    const crack = new Mesh(crackGeo, crackMaterial);
    crack.position.set(Math.sin(a) * 0.98, 0.9 + (i - 1) * 0.08, Math.cos(a) * 0.98);
    crack.rotation.set(0, a, 0.35 * (i - 1));
    crack.visible = false;
    root.add(crack);
    return crack;
  });
  root.add(pot, rim, brew);
  return {
    root,
    cracks,
    brewMaterial,
    glow: [brew],
    hit() {},
    shatter() {},
    update() {},
    apply(look) {
      cracks.forEach((c, i) => (c.visible = i < look.cracks));
      brewMaterial.emissiveIntensity = 2.5 * look.brew;
    },
    dispose() {
      for (const g of [potGeo, rimGeo, brewGeo, legGeo, crackGeo]) g.dispose();
      for (const m of [iron, brewMaterial, crackMaterial]) m.dispose();
    },
  };
}

export type KeyModel = {
  root: Group;
  material: MeshToonMaterial;
  /** Є, якщо модель `heart-key.glb` завантажилась: ключ сам висить і крутиться (кліп), тож зверху цього не додають. */
  actor?: Actor;
  dispose(): void;
};

/** Золотий світний Ключ: кільце, стрижень і два зубці. Центр — (0,0,0). З `heart-key.glb` — ключ із серцем нагорі. */
export function buildKey(): KeyModel {
  if (hasActor('key')) {
    const actor = createActor('key', { scale: 1.5, outline: 0.01 });
    actor.play('Key_Float_Spin', { fade: 0 });
    // Ключ позначено для сяйва: з повним світінням моделі він зливається в пляму, тож форму серця не видно.
    const material = actor.material('MAT_Key_Gold')!;
    material.emissiveIntensity = Math.min(material.emissiveIntensity, 0.8);
    return { root: actor.root, material, actor, dispose: actor.dispose };
  }
  const root = new Group();
  root.name = 'key';
  const material = toonMaterial({ color: '#ffd84a', emissive: '#ffc21a', emissiveIntensity: 1.8, metalness: 0.6, roughness: 0.3 });
  const ringGeo = new TorusGeometry(0.18, 0.05, 8, 16);
  const shaftGeo = new BoxGeometry(0.5, 0.07, 0.07);
  const toothGeo = new BoxGeometry(0.07, 0.14, 0.07);
  const ring = new Mesh(ringGeo, material);
  ring.position.x = -0.32;
  const shaft = new Mesh(shaftGeo, material);
  shaft.position.x = 0.08;
  const t1 = new Mesh(toothGeo, material);
  t1.position.set(0.24, -0.1, 0);
  const t2 = new Mesh(toothGeo, material);
  t2.position.set(0.32, -0.08, 0);
  root.add(ring, shaft, t1, t2);
  return {
    root,
    material,
    dispose() {
      for (const g of [ringGeo, shaftGeo, toothGeo]) g.dispose();
      material.dispose();
    },
  };
}
