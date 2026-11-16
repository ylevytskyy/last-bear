import { Color, DynamicDrawUsage, IcosahedronGeometry, InstancedMesh, MeshBasicMaterial, Object3D, type Scene } from 'three';
import type { Vec3 } from '../sim/level';

const POOL = 400;
const SMOKE = new Color('#0d0d12');
const DUST = new Color('#ffd54a');

export type Particles = {
  burst(at: Vec3): void;
  /** Лише жовтий пил, менша хмарка (влучання Удару). */
  dust(at: Vec3): void;
  trail(at: Vec3, moving: boolean): void;
  update(dt: number): void;
  activeCount(): number;
  dispose(): void;
};

/** Чорний дим і жовтий пил: пул з 400 частинок, що тануть за життя. */
export function createParticles(scene: Scene): Particles {
  const geometry = new IcosahedronGeometry(0.12, 0);
  const material = new MeshBasicMaterial({ color: 'white' });
  const mesh = new InstancedMesh(geometry, material, POOL);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const px = new Float32Array(POOL);
  const py = new Float32Array(POOL);
  const pz = new Float32Array(POOL);
  const vx = new Float32Array(POOL);
  const vy = new Float32Array(POOL);
  const vz = new Float32Array(POOL);
  const life = new Float32Array(POOL);
  const maxLife = new Float32Array(POOL);
  const size = new Float32Array(POOL);
  const dummy = new Object3D();
  let head = 0;

  const hide = (i: number): void => {
    dummy.position.set(0, -1000, 0);
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };
  for (let i = 0; i < POOL; i++) hide(i);

  const rand = (lo: number, hi: number) => lo + (hi - lo) * Math.random();

  function spawn(at: Vec3, color: Color, speed: number, lifetime: number, scale: number): void {
    const i = head;
    head = (head + 1) % POOL;
    const angle = rand(0, Math.PI * 2);
    const s = rand(0.4, 1) * speed;
    px[i] = at.x;
    py[i] = at.y + rand(0.2, 1.2);
    pz[i] = at.z;
    vx[i] = Math.cos(angle) * s;
    vy[i] = rand(0.3, 1.5);
    vz[i] = Math.sin(angle) * s;
    maxLife[i] = life[i] = lifetime * rand(0.7, 1);
    size[i] = scale;
    mesh.setColorAt(i, color);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  return {
    burst(at) {
      for (let k = 0; k < 24; k++) spawn(at, SMOKE, 3, 1, 1.8);
      for (let k = 0; k < 24; k++) spawn(at, DUST, 2.5, 0.8, 0.9);
    },
    dust(at) {
      for (let k = 0; k < 16; k++) spawn(at, DUST, 2, 0.5, 0.7);
    },
    trail(at, moving) {
      if (moving) spawn(at, DUST, 0.6, 0.45, 0.6);
    },
    update(dt) {
      for (let i = 0; i < POOL; i++) {
        if (life[i]! <= 0) continue;
        life[i]! -= dt;
        if (life[i]! <= 0) {
          life[i] = 0;
          hide(i);
          continue;
        }
        px[i]! += vx[i]! * dt;
        py[i]! += vy[i]! * dt;
        pz[i]! += vz[i]! * dt;
        vx[i]! *= 1 - Math.min(1, 2 * dt);
        vz[i]! *= 1 - Math.min(1, 2 * dt);
        dummy.position.set(px[i]!, py[i]!, pz[i]!);
        dummy.scale.setScalar(size[i]! * (life[i]! / maxLife[i]!));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    activeCount() {
      let n = 0;
      for (let i = 0; i < POOL; i++) if (life[i]! > 0) n++;
      return n;
    },
    dispose() {
      scene.remove(mesh);
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
