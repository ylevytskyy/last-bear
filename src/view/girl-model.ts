import { toonMaterial } from '../entities/toon';
import { ConeGeometry, Group, Mesh, MeshToonMaterial, SphereGeometry, CylinderGeometry } from 'three';

export type GirlModel = { root: Group; material: MeshToonMaterial; dispose(): void };

/** Силует дівчинки з примітивів: сукня-конус, голова, хвостики, ручки й ніжки. Підошви — (0,0,0). */
export function buildGirl(): GirlModel {
  const material = toonMaterial({ color: '#2a2a3a', emissive: '#ff3355', emissiveIntensity: 0, roughness: 0.8 });
  const dressGeo = new ConeGeometry(0.42, 0.9, 12);
  const headGeo = new SphereGeometry(0.22, 12, 10);
  const tailGeo = new SphereGeometry(0.09, 8, 6);
  const limbGeo = new CylinderGeometry(0.05, 0.05, 0.45, 6);
  const root = new Group();
  root.name = 'girl';
  const dress = new Mesh(dressGeo, material);
  dress.position.y = 0.85;
  const head = new Mesh(headGeo, material);
  head.position.y = 1.5;
  root.add(dress, head);
  for (const side of [-1, 1]) {
    const tail = new Mesh(tailGeo, material);
    tail.position.set(side * 0.24, 1.6, -0.05);
    const arm = new Mesh(limbGeo, material);
    arm.position.set(side * 0.3, 1.0, 0);
    arm.rotation.z = side * 0.35;
    const leg = new Mesh(limbGeo, material);
    leg.position.set(side * 0.12, 0.22, 0);
    root.add(tail, arm, leg);
  }
  return {
    root,
    material,
    dispose() {
      for (const g of [dressGeo, headGeo, tailGeo, limbGeo]) g.dispose();
      material.dispose();
    },
  };
}
