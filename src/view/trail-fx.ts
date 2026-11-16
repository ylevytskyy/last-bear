import { DynamicDrawUsage, IcosahedronGeometry, InstancedMesh, MeshStandardMaterial, Object3D, type Scene } from 'three';
import type { Vec3 } from '../sim/level';

/** Найбільше іскор Доріжки. */
const MAX_SPARKS = 160;

export type TrailFx = {
  /** Об'єкт для `bloom.mark`: іскри світяться. */
  object: Object3D;
  /** Іскри в точках Доріжки; мерехтять хвилею від початку до кінця. */
  update(points: readonly Vec3[], time: number): void;
  count(): number;
  dispose(): void;
};

/** Доріжка зі світного жовтого пилку. */
export function createTrail(scene: Scene): TrailFx {
  const geometry = new IcosahedronGeometry(0.09, 0);
  const material = new MeshStandardMaterial({ color: '#ffe066', emissive: '#ffcc33', emissiveIntensity: 2.5 });
  const mesh = new InstancedMesh(geometry, material, MAX_SPARKS);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  const dummy = new Object3D();
  return {
    object: mesh,
    update(points, time) {
      const n = Math.min(points.length, MAX_SPARKS);
      for (let i = 0; i < n; i++) {
        const p = points[i]!;
        const wave = 0.5 + 0.5 * Math.sin(time * 4 - i * 0.6);
        dummy.position.set(p.x, p.y + 0.12 + 0.08 * wave, p.z);
        dummy.scale.setScalar(0.6 + 0.8 * wave);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    },
    count: () => mesh.count,
    dispose() {
      scene.remove(mesh);
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
