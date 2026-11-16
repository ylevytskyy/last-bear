import { toonMaterial } from '../entities/toon';
import { createActor, hasActor, type Actor } from './glb-actors';
import {
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshToonMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';

export type BeeModel = { root: Group; wings: Mesh[]; bodyMaterial: MeshToonMaterial; /** Модель з анімацією (`bee-knight.glb`); є, якщо вона завантажилась. */ actor?: Actor; dispose(): void };
export type TurtleModel = {
  root: Group;
  body: Group;
  flask: Object3D;
  flaskMaterial: MeshToonMaterial;
  shellMaterial: MeshToonMaterial;
  /** Світні частини для `bloom.mark`. */
  glow: Object3D[];
  /** Модель з анімацією (`turtle.glb`); є, якщо вона завантажилась. */
  actor?: Actor;
  dispose(): void;
};

function tracker() {
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  return {
    g<T extends BufferGeometry>(x: T): T {
      geometries.push(x);
      return x;
    },
    m<T extends Material>(x: T): T {
      materials.push(x);
      return x;
    },
    dispose() {
      for (const x of geometries) x.dispose();
      for (const x of materials) x.dispose();
    },
  };
}

/** Кліпи `bee-knight.glb` за станом Бджоли в правилах. */
export const BEE_CLIPS = {
  IDLE: 'State1_Idle_Hover',
  WINDUP: 'State2_Red_Windup',
  DASH: 'State3_Dash_Attack',
  STUCK: 'State4_Stuck_Vulnerable',
  RECOVER: 'State5_Recover_Return',
} as const;

/** Бджола-Лицар. Центр тіла в (0,0,0), дивиться в +z. Без завантаженого `bee-knight.glb` — проста бджола з примітивів. */
export function buildBee(): BeeModel {
  if (hasActor('bee')) {
    // У моделі ноги на землі, тіло в повітрі на ~1 м: центр тіла ставимо в початок координат.
    const actor = createActor('bee', { scale: 1.1, offsetY: -1.0, outline: 0.012 });
    actor.play(BEE_CLIPS.IDLE, { fade: 0 });
    const bodyMaterial = actor.material('MAT_Bee_Yellow')!;
    return { root: actor.root, wings: [], bodyMaterial, actor, dispose: actor.dispose };
  }
  return buildBeePrimitive();
}

/** Бджола з примітивів: жовто-чорне тіло, прозорі крила, жало. */
function buildBeePrimitive(): BeeModel {
  const t = tracker();
  const root = new Group();
  root.name = 'bee';
  const bodyMaterial = t.m(toonMaterial({ color: '#ffc928', roughness: 0.6, flatShading: true, emissive: '#ff2020', emissiveIntensity: 0 }));
  const black = t.m(toonMaterial({ color: '#16161c', roughness: 0.7, flatShading: true }));
  const wingMaterial = t.m(toonMaterial({ color: '#dff4ff', transparent: true, opacity: 0.55, side: DoubleSide, roughness: 0.2 }));

  const body = new Mesh(t.g(new SphereGeometry(0.45, 14, 10)), bodyMaterial);
  body.scale.set(0.85, 0.8, 1.15);
  body.castShadow = true;
  root.add(body);
  for (const z of [-0.18, 0.08]) {
    const stripe = new Mesh(t.g(new TorusGeometry(0.37, 0.07, 6, 18)), black);
    stripe.position.z = z;
    stripe.scale.set(1, 0.95, 1);
    root.add(stripe);
  }
  const head = new Mesh(t.g(new SphereGeometry(0.24, 12, 8)), black);
  head.position.set(0, 0.05, 0.5);
  root.add(head);
  const sting = new Mesh(t.g(new CylinderGeometry(0, 0.08, 0.25, 6)), black);
  sting.rotation.x = -Math.PI / 2;
  sting.position.z = -0.6;
  root.add(sting);

  const wings: Mesh[] = [];
  for (const side of [-1, 1]) {
    const pivot = new Group();
    pivot.position.set(side * 0.15, 0.32, 0.05);
    const wing = new Mesh(t.g(new PlaneGeometry(0.6, 0.3)), wingMaterial);
    wing.position.x = side * 0.3;
    wing.rotation.x = -Math.PI / 2;
    pivot.add(wing);
    root.add(pivot);
    wings.push(wing);
  }
  return { root, wings, bodyMaterial, dispose: t.dispose };
}

/** Кліпи `turtle.glb` за станом Черепахи в правилах. */
export const TURTLE_CLIPS = {
  WALK: 'State1_Patrol_Walk',
  WINDUP: 'State2_Shield_Block',
  SPIN: 'State3_Shield_Bash',
  COOLDOWN: 'State4_Flask_Shatter_Stun',
} as const;

/** Черепаха з `turtle.glb`: `body` — обгортка, яку крутить розкрутка; підошви в (0,0,0), голова в +z. */
function buildTurtleActor(): TurtleModel {
  const actor = createActor('turtle', { outline: 0.012 });
  actor.play(TURTLE_CLIPS.WALK, { fade: 0 });
  const root = new Group();
  root.name = 'turtle';
  const body = new Group();
  body.add(actor.root);
  root.add(body);
  const flaskMaterial = actor.material('MAT_Potion_Liquid')!;
  return {
    root,
    body,
    flask: actor.bone('potion_flask') ?? actor.root,
    flaskMaterial,
    shellMaterial: actor.material('MAT_Shell_Dark')!,
    glow: actor.meshesOf('MAT_Potion_Liquid'),
    actor,
    dispose: actor.dispose,
  };
}

/**
 * Черепаха з примітивів: зелений панцир, голова в +z, на спині (−z) прозора світна Колба.
 * Підошви в (0,0,0). `body` крутиться під час розкрутки.
 */
export function buildTurtle(): TurtleModel {
  if (hasActor('turtle')) return buildTurtleActor();
  const t = tracker();
  const root = new Group();
  root.name = 'turtle';
  const body = new Group();
  root.add(body);
  const shellMaterial = t.m(toonMaterial({ color: '#3f8f4a', roughness: 0.8, flatShading: true, emissive: '#ff2020', emissiveIntensity: 0 }));
  const skin = t.m(toonMaterial({ color: '#9bcf6a', roughness: 0.8, flatShading: true }));
  const flaskMaterial = t.m(
    toonMaterial({ color: '#c77dff', emissive: '#b05cff', emissiveIntensity: 0.6, transparent: true, opacity: 0.75, roughness: 0.1 }),
  );

  const shell = new Mesh(t.g(new SphereGeometry(0.75, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), shellMaterial);
  shell.position.y = 0.3;
  shell.scale.set(1, 0.75, 1.1);
  shell.castShadow = true;
  body.add(shell);
  const belly = new Mesh(t.g(new CylinderGeometry(0.72, 0.72, 0.15, 14)), skin);
  belly.position.y = 0.3;
  belly.scale.z = 1.1;
  body.add(belly);
  const head = new Mesh(t.g(new SphereGeometry(0.26, 12, 8)), skin);
  head.position.set(0, 0.45, 0.95);
  head.castShadow = true;
  body.add(head);
  for (const [x, z] of [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]] as const) {
    const leg = new Mesh(t.g(new CylinderGeometry(0.14, 0.16, 0.3, 8)), skin);
    leg.position.set(x, 0.15, z);
    body.add(leg);
  }

  const flask = new Group();
  flask.name = 'flask';
  flask.position.set(0, 0.6, -0.55);
  const bulb = new Mesh(t.g(new SphereGeometry(0.26, 12, 10)), flaskMaterial);
  flask.add(bulb);
  const neck = new Mesh(t.g(new CylinderGeometry(0.08, 0.1, 0.25, 8)), flaskMaterial);
  neck.position.y = 0.3;
  flask.add(neck);
  body.add(flask);
  return { root, body, flask, flaskMaterial, shellMaterial, glow: [flask], dispose: t.dispose };
}
