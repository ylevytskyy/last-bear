import { toonMaterial } from '../entities/toon';
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshToonMaterial,
  Object3D,
  type BufferGeometry,
  type Material,
} from 'three';
import type { Vec3 } from '../sim/level';

/** Кут, на який відчиняються двері Клітки, рад. */
const DOOR_OPEN = (100 * Math.PI) / 180;
/** За скільки двері відчиняються, с. */
const DOOR_SECONDS = 0.6;

/** Кут дверей Клітки: 0 — зачинені; після відкриття плавно до 100° за 0.6 с і лишаються. */
export function cageDoorAngle(open: boolean, secondsSinceOpened: number): number {
  if (!open) return 0;
  const k = Math.min(1, Math.max(0, secondsSinceOpened / DOOR_SECONDS));
  return DOOR_OPEN * (1 - (1 - k) * (1 - k)); // плавне гальмування в кінці
}

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

export type CageModel = { root: Group; door: Group; lockMaterial: MeshToonMaterial | null; dispose(): void };

/**
 * Клітка з ґрат: куб `size` м, підлога в (0,0,0), двері з боку +z (куди дивиться `facing`).
 * Двері — група з віссю на лівому краю; поворот навколо y відчиняє їх назовні.
 */
export function buildCage(working: boolean, size: number): CageModel {
  const t = tracker();
  const root = new Group();
  root.name = 'cage';
  const metal = t.m(toonMaterial({ color: '#7a6a5a', roughness: 0.5, metalness: 0.6 }));
  const half = size / 2;
  const bar = t.g(new CylinderGeometry(0.04, 0.04, size, 6));
  const rail = t.g(new BoxGeometry(size, 0.08, 0.08));
  const BARS = 7;
  const dummy = new Object3D();
  const instancedMeshes: InstancedMesh[] = [];
  /** Усі однакові деталі — одна InstancedMesh: менше викликів малювання. */
  const instanced = (geometry: BufferGeometry, places: [number, number, number, number][]): InstancedMesh => {
    const mesh = new InstancedMesh(geometry, metal, places.length);
    places.forEach(([x, y, z, rotY], i) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    instancedMeshes.push(mesh);
    return mesh;
  };
  const along = (place: (u: number) => [number, number]): [number, number, number, number][] =>
    Array.from({ length: BARS + 1 }, (_, i) => {
      const [x, z] = place(-half + (size * i) / BARS);
      return [x, half, z, 0];
    });
  const walls = instanced(bar, [...along((u) => [u, -half]), ...along((u) => [-half, u]), ...along((u) => [half, u])]);
  walls.castShadow = false;
  const rails: [number, number, number, number][] = [];
  for (const y of [0.04, size - 0.04]) {
    for (const [x, z, rot] of [[0, -half, 0], [-half, 0, Math.PI / 2], [half, 0, Math.PI / 2], [0, half, 0]] as const) rails.push([x, y, z, rot]);
  }
  root.add(walls, instanced(rail, rails));
  const roof = new Mesh(t.g(new BoxGeometry(size, 0.06, size)), metal);
  roof.position.y = size;
  root.add(roof);

  const door = new Group();
  door.name = 'door';
  door.position.set(-half, 0, half);
  const doorBars = instanced(bar, along((u) => [u + half, 0]));
  doorBars.castShadow = false;
  door.add(doorBars);
  root.add(door);

  let lockMaterial: MeshToonMaterial | null = null;
  if (working) {
    lockMaterial = t.m(toonMaterial({ color: '#ffd84a', emissive: '#ffc21a', emissiveIntensity: 2.5 }));
    const lock = new Mesh(t.g(new BoxGeometry(0.28, 0.32, 0.14)), lockMaterial);
    lock.name = 'lock';
    lock.position.set(size - 0.15, half, 0.08);
    door.add(lock);
  }
  return {
    root,
    door,
    lockMaterial,
    dispose() {
      for (const m of instancedMeshes) m.dispose(); // буфери матриць екземплярів
      t.dispose();
    },
  };
}

export type HouseModel = { root: Group; dispose(): void };

/** Будиночок на місці блока `halfExtents`: теплі стіни, двосхилий дах і темні двері. Центр — центр блока. */
export function buildHouse(halfExtents: Vec3): HouseModel {
  const t = tracker();
  const root = new Group();
  root.name = 'house';
  const wall = t.m(toonMaterial({ color: '#c9a77c', roughness: 0.9, flatShading: true }));
  const roofMat = t.m(toonMaterial({ color: '#8b3a2e', roughness: 0.8, flatShading: true }));
  const doorMat = t.m(toonMaterial({ color: '#4a2f1d', roughness: 0.9 }));
  const body = new Mesh(t.g(new BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2)), wall);
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);
  const roof = new Mesh(t.g(new ConeGeometry(1, 1, 4, 1)), roofMat);
  roof.name = 'roof';
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(halfExtents.x * 1.55, halfExtents.y * 0.9, halfExtents.z * 1.55);
  roof.position.y = halfExtents.y + halfExtents.y * 0.45;
  roof.castShadow = true;
  root.add(roof);
  const door = new Mesh(t.g(new BoxGeometry(0.8, 1.4, 0.05)), doorMat);
  door.position.set(0, -halfExtents.y + 0.7, halfExtents.z + 0.03);
  root.add(door);
  return { root, dispose: t.dispose };
}
