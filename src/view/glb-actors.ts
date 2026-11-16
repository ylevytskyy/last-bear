import {
  AnimationAction,
  AnimationMixer,
  BackSide,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Quaternion,
  SkinnedMesh,
  Vector3,
  type AnimationClip,
  type Material,
  type MeshStandardMaterial,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { toonMaterial } from '../entities/toon';

/** Моделі з анімацією (`public/models/*.glb`), що замінили зібрані з примітивів. */
export type ActorKind = 'sofia' | 'bee' | 'survivor' | 'turtle' | 'cage' | 'cauldron' | 'key' | 'tulip';

const FILES: Record<ActorKind, string> = {
  sofia: 'models/sofia.glb',
  bee: 'models/bee-knight.glb',
  survivor: 'models/survivor.glb',
  turtle: 'models/turtle.glb',
  cage: 'models/captive-cub-cage.glb',
  cauldron: 'models/cauldron-source.glb',
  key: 'models/heart-key.glb',
  tulip: 'models/tulip-portal.glb',
};

/**
 * Експорт props пише в extras кореневого вузла `pivot` як текстову примітку («ground center»), а GLTFLoader читає
 * `pivot` як масив [x, y, z] і робить із нього NaN-положення всього рига: модель зникає. Перейменовуємо примітку до розбору.
 */
function renameTextPivot(parser: { json: { nodes?: { extras?: Record<string, unknown> }[] } }) {
  return {
    name: 'LastBearTextPivot',
    beforeRoot() {
      for (const node of parser.json.nodes ?? []) {
        const extras = node.extras;
        if (extras && typeof extras['pivot'] === 'string') {
          extras['pivot_note'] = extras['pivot'];
          delete extras['pivot'];
        }
      }
      return null;
    },
  };
}

type Template = { scene: Group; clips: AnimationClip[] };
const templates = new Map<ActorKind, Template>();

/** Завантажує всі моделі наперед: далі `createActor` синхронний. Модель, що не завантажилась, просто відсутня. */
export async function preloadActors(base = import.meta.env.BASE_URL): Promise<void> {
  const loader = new GLTFLoader();
  loader.register(renameTextPivot);
  await Promise.all(
    (Object.keys(FILES) as ActorKind[]).map(async (kind) => {
      try {
        const gltf = await loader.loadAsync(`${base}${FILES[kind]}`);
        templates.set(kind, { scene: gltf.scene, clips: gltf.animations });
      } catch (error) {
        console.warn(`model ${kind} not loaded`, error);
      }
    }),
  );
}

export const hasActor = (kind: ActorKind): boolean => templates.has(kind);

export type Actor = {
  /** Обгортка: її можна рухати, крутити й масштабувати. Модель усередині вже поставлена на землю й дивиться в +z. */
  root: Group;
  clips: string[];
  /** Назва кліпу, що грає зараз у шарі за замовчуванням. */
  current(): string | null;
  /**
   * Вмикає кліп з плавним переходом; той самий кліп повторно не перезапускає.
   * `layer` — окремий шар: кліпи різних шарів грають разом (Клітка й Ведмежа в одному файлі), перехід лише в межах шару.
   */
  play(name: string, options?: { fade?: number; once?: boolean; speed?: number; layer?: string }): void;
  /** Ставить кліп на кадр `k` (0..1 його тривалості) і тримає: так розкриття Квітки йде за станом правил. */
  scrub(name: string, k: number): void;
  update(dt: number): void;
  /** Матеріали без власного світіння: їх можна фарбувати червоним при ударі й ворожому замаху. */
  tintable: MeshToonMaterial[];
  material(name: string): MeshToonMaterial | undefined;
  /** Сітки з цим матеріалом (для позначки світіння). */
  meshesOf(name: string): Mesh[];
  bone(name: string): Object3D | undefined;
  /** Показує чи ховає сітку (або вузол) за назвою разом з її контуром. */
  show(name: string, visible: boolean): void;
  /** Повертає кістку навколо осі x моделі після кліпу (щоб додати удар, якого немає в анімації). */
  swingBone(name: string, radians: number): void;
  dispose(): void;
};

export type ActorOptions = {
  /** Множник розміру моделі. */
  scale?: number;
  /** Зсув моделі по висоті в обгортці, м (до масштабу). */
  offsetY?: number;
  /** Товщина контуру в метрах моделі; 0 — без контуру. */
  outline?: number;
};

const outlines = new Map<number, MeshBasicMaterial>();
/** Контур для скінованих сіток: темна копія, видута вздовж нормалей вже після скінінгу, видима лише ізсередини. */
function outlineMaterial(width: number): MeshBasicMaterial {
  let material = outlines.get(width);
  if (!material) {
    material = new MeshBasicMaterial({ color: '#16121c', side: BackSide });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <skinning_vertex>',
        `#include <skinning_vertex>\ntransformed += normalize(objectNormal) * ${width.toFixed(4)};`,
      );
    };
    material.customProgramCacheKey = () => `actor-outline-${width}`;
    outlines.set(width, material);
  }
  return material;
}

function toToon(source: MeshStandardMaterial): MeshToonMaterial {
  const material = toonMaterial({
    color: source.color,
    emissive: source.emissive,
    emissiveIntensity: source.emissiveIntensity,
    transparent: source.transparent,
    opacity: source.opacity,
    side: source.side,
    map: source.map,
  });
  material.name = source.name;
  material.depthWrite = source.depthWrite;
  return material;
}

/** Нова копія моделі зі своїм скелетом, матеріалами й міксером. Моделі мають бути завантажені (`preloadActors`). */
export function createActor(kind: ActorKind, options: ActorOptions = {}): Actor {
  const template = templates.get(kind);
  if (!template) throw new Error(`model ${kind} is not loaded`);
  const { scale = 1, offsetY = 0, outline = 0 } = options;

  const model = cloneSkinned(template.scene) as Group;
  model.position.y = offsetY * scale;
  model.scale.setScalar(scale);
  const root = new Group();
  root.name = `actor-${kind}`;
  root.add(model);

  const converted = new Map<Material, MeshToonMaterial>();
  const toon = (material: Material): MeshToonMaterial => {
    let result = converted.get(material);
    if (!result) {
      result = toToon(material as MeshStandardMaterial);
      converted.set(material, result);
    }
    return result;
  };
  const shells: SkinnedMesh[] = [];
  const shellOf = new Map<Object3D, SkinnedMesh>();
  const meshes: Mesh[] = [];
  model.traverse((o) => {
    if (o instanceof Mesh) meshes.push(o);
  });
  for (const mesh of meshes) {
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toon) : toon(mesh.material);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false; // кістки виносять сітку за межі початкової оболонки
    const transparent = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some((m) => m.transparent);
    if (outline > 0 && mesh instanceof SkinnedMesh && !transparent) {
      const shell = new SkinnedMesh(mesh.geometry, outlineMaterial(outline));
      shell.userData['outline'] = true;
      shell.frustumCulled = false;
      shell.castShadow = false;
      shell.position.copy(mesh.position);
      shell.quaternion.copy(mesh.quaternion);
      shell.scale.copy(mesh.scale);
      mesh.parent?.add(shell);
      shell.bind(mesh.skeleton, mesh.bindMatrix);
      shells.push(shell);
      shellOf.set(mesh, shell);
    }
  }

  const materials = [...converted.values()];
  const mixer = new AnimationMixer(model);
  const actions = new Map<string, AnimationAction>();
  const clipsByName = new Map(template.clips.map((c) => [c.name, c]));
  const currents = new Map<string, string>();
  const DEFAULT_LAYER = 'main';
  const scrubbed = new Set<string>();

  const bones = new Map<string, Object3D>();
  model.traverse((o) => {
    if (o.name) bones.set(o.name, o);
  });

  const parentQ = new Quaternion();
  const rootQ = new Quaternion();
  const delta = new Quaternion();
  const axis = new Vector3();

  return {
    root,
    clips: [...clipsByName.keys()],
    current: () => currents.get(DEFAULT_LAYER) ?? null,
    scrub(name, k) {
      const clip = clipsByName.get(name);
      if (!clip) return;
      let action = actions.get(name);
      if (!action) {
        action = mixer.clipAction(clip);
        actions.set(name, action);
      }
      if (!scrubbed.has(name)) {
        scrubbed.add(name);
        action.reset();
        action.play();
        action.paused = true;
      }
      action.time = Math.min(1, Math.max(0, k)) * clip.duration;
    },
    play(name, { fade = 0.15, once = false, speed = 1, layer = DEFAULT_LAYER } = {}) {
      const current = currents.get(layer);
      if (current === name) return;
      const clip = clipsByName.get(name);
      if (!clip) return;
      let next = actions.get(name);
      if (!next) {
        next = mixer.clipAction(clip);
        actions.set(name, next);
      }
      next.reset();
      next.setLoop(once ? LoopOnce : LoopRepeat, Infinity);
      next.clampWhenFinished = once;
      next.timeScale = speed;
      const previous = current ? actions.get(current) : undefined;
      if (previous && fade > 0) next.crossFadeFrom(previous, fade, false);
      else previous?.stop();
      next.play();
      currents.set(layer, name);
    },
    update(dt) {
      mixer.update(dt);
    },
    tintable: materials.filter((m) => m.emissiveIntensity === 0 || (m.emissive.r + m.emissive.g + m.emissive.b === 0)).filter((m) => !m.transparent),
    material: (name) => materials.find((m) => m.name === name),
    meshesOf: (name) =>
      meshes.filter((m) => (Array.isArray(m.material) ? m.material : [m.material]).some((x) => x.name === name)),
    bone: (name) => bones.get(name),
    show(name, visible) {
      const node = bones.get(name);
      if (!node) return;
      node.visible = visible;
      const shell = shellOf.get(node);
      if (shell) shell.visible = visible;
    },
    swingBone(name, radians) {
      const bone = bones.get(name);
      if (!bone?.parent || radians === 0) return;
      root.updateWorldMatrix(true, true);
      bone.parent.getWorldQuaternion(parentQ);
      root.getWorldQuaternion(rootQ);
      axis.set(1, 0, 0).applyQuaternion(rootQ);
      delta.setFromAxisAngle(axis, radians);
      bone.quaternion.premultiply(parentQ.clone().invert().multiply(delta).multiply(parentQ));
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const shell of shells) shell.removeFromParent();
      for (const m of materials) m.dispose(); // геометрії й скелет-шаблон спільні для всіх копій
    },
  };
}
