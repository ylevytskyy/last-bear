import { toonMaterial } from '../entities/toon';
import { CylinderGeometry, Group, Mesh, MeshToonMaterial, SphereGeometry } from 'three';
import { TUNING, type Tuning } from '../sim/tuning';
import { petalAngle } from './flower-pose';
import { createActor, hasActor, type Actor } from './glb-actors';

export const PETAL_COLORS = { yellow: '#ffd22a', pink: '#ff8fc7', blue: '#7fb8ff' } as const;

export type FlowerModel = {
  root: Group;
  petals: Group[];
  pollenMaterial: MeshToonMaterial;
  /** Є, якщо модель `tulip-portal.glb` завантажилась. */
  actor?: Actor;
  setOpenness(openness: number): void;
  dispose(): void;
};

/** Квітка-портал з `tulip-portal.glb`: розкриття (0..1) ставить кліп `Tulip_Bloom_Open` на відповідний кадр. */
function buildFlowerActor(color: keyof typeof PETAL_COLORS): FlowerModel {
  const actor = createActor('tulip', { outline: 0.012 });
  actor.material('MAT_Tulip_Petal')?.color.set(PETAL_COLORS[color]);
  actor.root.name = `flower-${color}`;
  const pollenMaterial = actor.material('MAT_Portal_Core')!;
  const coreGlow = pollenMaterial.emissiveIntensity;
  const model: FlowerModel = {
    root: actor.root,
    petals: [],
    pollenMaterial,
    actor,
    setOpenness(openness) {
      actor.scrub('Tulip_Bloom_Open', openness);
      pollenMaterial.emissiveIntensity = coreGlow * (0.4 + 0.6 * openness);
      actor.update(0);
    },
    dispose: actor.dispose,
  };
  model.setOpenness(0);
  return model;
}

/**
 * Велика Квітка: товста ніжка (як `stemBlock` у правилах), листя, шість пелюсток навколо серцевини з пилком.
 * Земля під ніжкою — (0,0,0).
 */
export function buildFlower(color: keyof typeof PETAL_COLORS, tuning: Tuning = TUNING): FlowerModel {
  if (hasActor('tulip')) return buildFlowerActor(color);
  const v = tuning.village;
  const root = new Group();
  root.name = `flower-${color}`;
  const green = toonMaterial({ color: '#3f8f4a', roughness: 0.8, flatShading: true });
  const petalMaterial = toonMaterial({ color: PETAL_COLORS[color], roughness: 0.6, flatShading: true });
  const pollenMaterial = toonMaterial({ color: '#ffb000', emissive: '#ff9a00', emissiveIntensity: 1.5 });

  const stemGeo = new CylinderGeometry(v.flowerStemHalfWidth, v.flowerStemHalfWidth * 1.1, v.flowerStemTop, 10);
  const stem = new Mesh(stemGeo, green);
  stem.position.y = v.flowerStemTop / 2;
  stem.castShadow = true;
  const stalkGeo = new CylinderGeometry(0.12, 0.16, v.flowerBudHeight - v.flowerStemTop, 8);
  const stalk = new Mesh(stalkGeo, green);
  stalk.position.y = v.flowerStemTop + (v.flowerBudHeight - v.flowerStemTop) / 2;
  const leafGeo = new SphereGeometry(0.35, 8, 6);
  const leaves = [-1, 1].map((side) => {
    const leaf = new Mesh(leafGeo, green);
    leaf.scale.set(1, 0.15, 0.45);
    leaf.position.set(side * 0.45, 0.35, 0);
    leaf.rotation.z = side * 0.3;
    return leaf;
  });
  root.add(stem, stalk, ...leaves);

  const head = new Group();
  head.position.y = v.flowerBudHeight;
  const coreGeo = new SphereGeometry(0.28, 12, 8);
  const core = new Mesh(coreGeo, pollenMaterial);
  core.name = 'pollen';
  head.add(core);
  const petalGeo = new SphereGeometry(0.5, 10, 8);
  const petals: Group[] = [];
  for (let i = 0; i < 6; i++) {
    const around = new Group();
    around.rotation.y = (i * Math.PI) / 3;
    const hinge = new Group(); // нахил пелюстки назовні навколо x
    const petal = new Mesh(petalGeo, petalMaterial);
    petal.scale.set(0.55, 1, 0.18);
    petal.position.set(0, 0.45, 0.12);
    petal.castShadow = true;
    hinge.add(petal);
    around.add(hinge);
    head.add(around);
    petals.push(hinge);
  }
  root.add(head);

  const model: FlowerModel = {
    root,
    petals,
    pollenMaterial,
    setOpenness(openness) {
      const a = petalAngle(openness);
      for (const p of petals) p.rotation.x = a;
      pollenMaterial.emissiveIntensity = 0.5 + 2.5 * openness;
    },
    dispose() {
      for (const g of [stemGeo, stalkGeo, leafGeo, coreGeo, petalGeo]) g.dispose();
      for (const m of [green, petalMaterial, pollenMaterial]) m.dispose();
    },
  };
  model.setOpenness(0);
  return model;
}
