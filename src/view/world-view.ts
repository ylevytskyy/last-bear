import {
  BoxGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Camera,
  type Texture,
  type Object3D,
  type Scene,
} from 'three';
import { progressOf, trailPath } from '../sim/guide';
import type { Level } from '../sim/level';
import type { Sim, SimEvent } from '../sim/sim';
import { TUNING } from '../sim/tuning';
import type { Bloom } from './bloom';
import { createBubble } from './bubble';
import { BEE_CLIPS, TURTLE_CLIPS, buildBee, buildTurtle, type BeeModel, type TurtleModel } from './enemy-models';
import { enemyPose } from './enemy-pose';
import { bubbleFrame, bubbleFrames, bubbleVisible, trailPoints } from './guide-fx';
import { hitFxFor } from './hit-fx';
import type { Particles } from './particles';
import type { Sound } from './sound';
import { createTrail } from './trail-fx';
import { createVillageView } from './village-view';
import { lerpVec3, type Previous } from './smoothing';
import { addOutline } from '../entities/toon';
import { dressWorld, surfaceTextures } from './dressing';
import type { WorldId } from '../sim/level';
import { worldLook, type WorldLook } from './world-looks';
import { buildKey, buildSource, sourceLook } from './source-model';
import { buildSign } from './sign-model';

/** Те, що світ показу бере в спільного показу гри. */
export type WorldViewDeps = {
  scene: Scene;
  bloom: Pick<Bloom, 'mark'>;
  camera: Camera;
  canvas: { clientWidth: number; clientHeight: number };
  hudRoot: HTMLElement;
  particles: Pick<Particles, 'burst' | 'dust'>;
  sound: Pick<Sound, 'clink' | 'whoosh'>;
  /** Значення для перевірок у браузері. */
  debug: Record<string, unknown>;
};

export type WorldView = {
  frame(dt: number, events: readonly SimEvent[], smooth?: { previous: Previous; alpha: number }): void;
  /** Скільки сіток цей світ додав у сцену. */
  meshCount(): number;
  dispose(): void;
};

/** Відстань між іскрами Доріжки, м. */
const TRAIL_SPACING = 0.8;
/** Скільки ворог спалахує білим після влучання, с. */
const HIT_FLASH_SECONDS = 0.12;

const safely = (play: () => void) => {
  try {
    play();
  } catch {
    // звук не повинен зупиняти гру
  }
};

/**
 * Усе, що належить одному світу: блоки, рухомі платформи, вороги, Селище, Квітки, Доріжка, Бульбашка.
 * Будується при вході у світ і звільняється при виході; спільне (рендерер, Софійка, камера, HUD) — у `game-view`.
 */
export function createWorldView(
  deps: WorldViewDeps,
  sim: Sim,
  level: Level,
  look: WorldLook = worldLook('village'),
  world: WorldId | null = null,
): WorldView {
  const { scene, bloom, camera, canvas, hudRoot, particles, sound, debug } = deps;
  const added: Object3D[] = [];
  const add = (o: Object3D) => {
    scene.add(o);
    added.push(o);
  };
  const disposers: (() => void)[] = [];

  // --- блоки рівня ------------------------------------------------------
  const solidMaterial = new MeshStandardMaterial({ color: look.ground, roughness: 0.9, flatShading: true });
  const wallMaterial = new MeshStandardMaterial({ color: look.wall, roughness: 0.85, flatShading: true });
  const barsMaterial = new MeshStandardMaterial({ color: '#ffb347', transparent: true, opacity: 0.35, roughness: 0.6 });
  const edgeMaterial = new LineBasicMaterial({ color: '#ffd9a0' });
  disposers.push(() => [solidMaterial, wallMaterial, barsMaterial, edgeMaterial].forEach((m) => m.dispose()));
  /** Висока брила — стіна, низька — підлога чи платформа. */
  const WALL_HALF_HEIGHT = 0.6;
  const box = (hx: number, hy: number, hz: number) => {
    const g = new BoxGeometry(hx * 2, hy * 2, hz * 2);
    disposers.push(() => g.dispose());
    return g;
  };
  // Текстури світу: шпалери, килим, трава, соти. Кожен блок має свій повтор текстури за розміром.
  const surfaces = world ? surfaceTextures(world) : {};
  disposers.push(() => {
    surfaces.ground?.map.dispose();
    surfaces.wall?.map.dispose();
  });
  let texturedCount = 0;
  const textured = (base: MeshStandardMaterial, surface: { map: Texture; metres: number } | undefined, w: number, d: number) => {
    if (!surface) return base;
    const map = surface.map.clone();
    map.repeat.set(Math.max(1, w / surface.metres), Math.max(1, d / surface.metres));
    map.needsUpdate = true;
    const material = base.clone();
    material.map = map;
    material.color.set('#ffffff');
    // Платформи з кількох блоків мають спільний верх: різний зсув глибини прибирає мерехтіння (z-fighting).
    texturedCount++;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -(texturedCount % 8) * 0.5;
    material.polygonOffsetUnits = -(texturedCount % 8);
    disposers.push(() => {
      map.dispose();
      material.dispose();
    });
    return material;
  };
  for (const b of level.blocks) {
    if (b.look === 'house' || b.look === 'stem' || b.look === 'source') continue; // власні моделі
    const geometry = box(b.halfExtents.x, b.halfExtents.y, b.halfExtents.z);
    const isWall = b.halfExtents.y > WALL_HALF_HEIGHT;
    const material =
      b.kind !== 'solid'
        ? barsMaterial
        : isWall
          ? textured(wallMaterial, surfaces.wall, Math.max(b.halfExtents.x, b.halfExtents.z) * 2, b.halfExtents.y * 2)
          : textured(solidMaterial, surfaces.ground, b.halfExtents.x * 2, b.halfExtents.z * 2);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(b.center.x, b.center.y, b.center.z);
    mesh.receiveShadow = true;
    mesh.castShadow = b.kind === 'solid';
    add(mesh);
    if (b.kind === 'bars') {
      const edgesGeometry = new EdgesGeometry(geometry);
      disposers.push(() => edgesGeometry.dispose());
      const edges = new LineSegments(edgesGeometry, edgeMaterial);
      edges.position.copy(mesh.position);
      add(edges);
    }
  }

  // --- прикраси (без колізії) ---------------------------------------------
  if (world) {
    const dressing = dressWorld(world, level);
    for (const o of dressing.glow) bloom.mark(o);
    add(dressing.root);
    disposers.push(() => dressing.dispose());
  }

  // --- рухомі платформи ---------------------------------------------------
  const movers = new Map<string, Mesh>();
  for (const m of level.movers ?? []) {
    const mesh = new Mesh(box(m.block.halfExtents.x, m.block.halfExtents.y, m.block.halfExtents.z), solidMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(m.block.center.x, m.block.center.y, m.block.center.z);
    add(mesh);
    movers.set(m.id, mesh);
  }

  // --- вороги -------------------------------------------------------------
  /** Остання відома позиція ворога (переможений зникає з `sim.enemies` у тому ж кроці). */
  const lastEnemyAt = new Map<string, { x: number; y: number; z: number }>();
  const flashUntil = new Map<string, number>();
  type EnemyView = { kind: 'bee'; model: BeeModel; wingPhase: number } | { kind: 'turtle'; model: TurtleModel };
  const enemyViews = new Map<string, EnemyView>();
  for (const spawn of level.enemies ?? []) {
    if (spawn.kind === 'bee') {
      const model = buildBee();
      for (const w of model.wings) w.userData['noOutline'] = true;
      addOutline(model.root);
      add(model.root);
      enemyViews.set(spawn.id, { kind: 'bee', model, wingPhase: 0 });
    } else {
      const model = buildTurtle();
      if (!model.actor) {
        // Модель з анімацією має власний контур; простій черепасі контур додаємо тут.
        model.flask.traverse((o) => (o.userData['noOutline'] = true));
        addOutline(model.root);
      }
      for (const o of model.glow) bloom.mark(o);
      add(model.root);
      enemyViews.set(spawn.id, { kind: 'turtle', model });
    }
  }
  disposers.push(() => enemyViews.forEach((v) => v.model.dispose()));

  function drawEnemies(dt: number, smooth?: { previous: Previous; alpha: number }): void {
    const present = new Set<string>();
    const t = sim.time;
    for (const e of sim.enemies) {
      const view = enemyViews.get(e.id);
      if (!view) continue;
      present.add(e.id);
      lastEnemyAt.set(e.id, { ...e.position });
      const flashing = (flashUntil.get(e.id) ?? -1) > t;
      const p = enemyPose(e.state, e.kind, e.stateTime);
      const before = smooth?.previous.enemies.get(e.id);
      const at = before ? lerpVec3(before, e.position, smooth!.alpha) : e.position;
      debug[`pose:${e.id}`] = { state: e.state, ...p };
      const root = view.model.root;
      root.position.set(
        at.x + p.shake * Math.sin(t * 71),
        at.y + p.shake * Math.sin(t * 53 + 1),
        at.z + p.shake * Math.cos(t * 67),
      );
      root.rotation.y = e.facing;
      if (view.kind === 'bee' && view.model.actor) {
        const actor = view.model.actor;
        actor.play(BEE_CLIPS[e.state as keyof typeof BEE_CLIPS] ?? BEE_CLIPS.IDLE, { once: e.state === 'DASH' });
        actor.update(dt * sim.timeScale);
        view.model.bodyMaterial.emissive.set(flashing ? '#ffffff' : '#ff2020');
        view.model.bodyMaterial.emissiveIntensity = flashing ? 1.5 : p.tint * 1.2;
      } else if (view.kind === 'bee') {
        view.wingPhase += dt * 45 * p.wingSpeed;
        view.model.wings.forEach((w, i) => {
          if (w.parent) w.parent.rotation.z = (i === 0 ? -1 : 1) * (0.2 + 0.6 * Math.sin(view.wingPhase)) * (p.wingSpeed > 0 ? 1 : 0.3);
        });
        view.model.bodyMaterial.emissive.set(flashing ? '#ffffff' : '#ff2020');
        view.model.bodyMaterial.emissiveIntensity = flashing ? 1.5 : p.tint * 1.2;
      } else {
        view.model.body.rotation.y = e.state === 'SPIN' ? e.stateTime * 14 : 0;
        if (view.model.actor) {
          view.model.actor.play(TURTLE_CLIPS[e.state as keyof typeof TURTLE_CLIPS] ?? TURTLE_CLIPS.WALK, { once: e.state !== 'WALK', fade: 0.12 });
          view.model.actor.update(dt * sim.timeScale);
        }
        view.model.flaskMaterial.emissiveIntensity = p.flaskGlow;
        view.model.shellMaterial.emissive.set(flashing ? '#ffffff' : '#ff2020');
        view.model.shellMaterial.emissiveIntensity = flashing ? 1.5 : p.tint;
      }
    }
    for (const [id, view] of enemyViews) view.model.root.visible = present.has(id);
  }

  // --- Джерело, Ключ, таблички --------------------------------------------
  const source = level.source ? buildSource() : null;
  const key = level.source ? buildKey() : null;
  if (source && level.source) {
    source.root.position.set(level.source.position.x, level.source.position.y, level.source.position.z);
    for (const o of source.glow) bloom.mark(o);
    add(source.root);
    disposers.push(() => source.dispose());
  }
  if (key) {
    key.root.visible = false;
    bloom.mark(key.root);
    add(key.root);
    disposers.push(() => key.dispose());
  }
  const signs = (level.signs ?? []).map((spec) => {
    const sign = buildSign(spec.keys);
    sign.root.position.set(spec.position.x, spec.position.y, spec.position.z);
    sign.root.rotation.y = spec.facing;
    add(sign.root);
    disposers.push(() => sign.dispose());
    return sign;
  });
  debug['signs'] = signs.length;

  // --- Селище, Доріжка, Бульбашка ----------------------------------------
  const village = createVillageView(scene, bloom, sim, level);
  const bubble = createBubble(hudRoot);
  const trail = createTrail(scene);
  bloom.mark(trail.object);

  const toScreen = (x: number, y: number, z: number) => {
    const v = new Vector3(x, y, z).project(camera);
    return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
  };

  return {
    frame(dt, events, smooth) {
      const s = sim.sofiyka;
      for (const e of events) {
        const hit = hitFxFor(e);
        const id = e.type === 'struck' ? e.enemyId : e.type === 'enemyDefeated' ? e.id : null;
        const at = id ? lastEnemyAt.get(id) : undefined;
        if (at && hit.burst === 'dust') particles.dust(at);
        if (at && hit.burst === 'smoke') particles.burst(at);
        if (id && hit.flash) flashUntil.set(id, sim.time + HIT_FLASH_SECONDS);
        if (hit.sound === 'clink') safely(() => sound.clink());
        if (hit.sound === 'whoosh') safely(() => sound.whoosh());
        if (e.type === 'cageOpened') {
          const cage = level.cages?.find((c) => c.id === e.id);
          if (cage) particles.dust(cage.position);
        }
        if (e.type === 'sourceStruck') source?.hit();
        if (e.type === 'sourceBroken') source?.shatter();
        if ((e.type === 'sourceStruck' || e.type === 'sourceBroken') && level.source) {
          const p = level.source.position;
          particles.dust({ x: p.x, y: p.y + 1.2, z: p.z });
          if (e.type === 'sourceBroken') particles.burst(p);
          safely(() => (e.type === 'sourceBroken' ? sound.whoosh() : sound.clink()));
        }
        if (e.type === 'keyPicked' && key) {
          particles.dust(key.root.position);
          safely(() => sound.whoosh());
        }
        if (e.type === 'flowerEntered') {
          const flower = level.flowers?.find((f) => f.id === e.id);
          if (flower) particles.dust({ ...flower.position, y: flower.position.y + TUNING.village.flowerBudHeight });
          safely(() => sound.whoosh());
        }
      }

      for (const m of sim.movers) {
        const before = smooth?.previous.movers.get(m.id);
        const at = before ? lerpVec3(before, m.position, smooth!.alpha) : m.position;
        movers.get(m.id)?.position.set(at.x, at.y, at.z);
      }
      const state = sim.source;
      if (source && state) {
        const look = sourceLook(state.hp, TUNING.hitsToDefeat.source);
        source.apply(look);
        source.update(dt * sim.timeScale);
        const keyAt = state.keyAt;
        if (key) {
          key.root.visible = keyAt !== null;
          if (keyAt && key.actor) {
            // Ключ з моделі сам гойдається й крутиться (кліп `Key_Float_Spin`).
            key.root.position.set(keyAt.x, keyAt.y + 0.8, keyAt.z);
            key.actor.update(dt * sim.timeScale);
          } else if (keyAt) {
            key.root.position.set(keyAt.x, keyAt.y + 0.8 + 0.12 * Math.sin(sim.time * 3), keyAt.z);
            key.root.rotation.y = sim.time * 2;
          }
        }
        debug['source'] = { ...look, keyVisible: keyAt !== null, hp: state.hp };
      }
      debug['movers'] = sim.movers.map((m) => ({ id: m.id, position: { ...m.position } }));
      drawEnemies(dt, smooth);
      village.frame(dt);
      debug['village'] = village.counts();
      debug['villageState'] = village.state();
      debug['lantern'] = village.lanternAt();

      const progress = progressOf(s.keys, sim.cages);
      const path = level.trail ? trailPath(progress, level.trail) : [];
      const sparks = trailPoints(path, TRAIL_SPACING);
      trail.update(sparks, sim.time);
      debug['trail'] = { count: trail.count(), first: sparks[0] ?? null, last: sparks.at(-1) ?? null, progress };
      if (level.survivor && bubbleVisible(s.position, level.survivor.position, TUNING)) {
        const sp = level.survivor.position;
        const at = toScreen(sp.x, sp.y + 2.3, sp.z);
        const picture = bubbleFrame(bubbleFrames(progress), sim.time, TUNING.village.bubbleFrameSeconds);
        bubble.show(at.x, at.y, picture);
        debug['bubble'] = picture;
      } else {
        bubble.show(0, 0, null);
        debug['bubble'] = null;
      }
    },
    meshCount() {
      let n = 0;
      for (const o of added) o.traverse((x) => (x instanceof Mesh || x instanceof LineSegments ? n++ : undefined));
      return n + village.meshCount() + 1; // +1 — іскри Доріжки (одна InstancedMesh)
    },
    dispose() {
      for (const o of added) scene.remove(o);
      village.dispose();
      bubble.dispose();
      trail.dispose();
      for (const d of disposers) d();
    },
  };
}
