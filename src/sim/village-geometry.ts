import type { Block, CageSpawn, FlowerSpawn, Level } from './level';
import { sourceBlock } from './source';
import { TUNING, type Tuning } from './tuning';

/** Бік дверей: одиничний вектор уздовж осі, найближчої до `facing` (Клітки стоять рівно). */
function doorSide(facing: number): { x: number; z: number } {
  const s = Math.sin(facing);
  const c = Math.cos(facing);
  return Math.abs(s) > Math.abs(c) ? { x: Math.sign(s), z: 0 } : { x: 0, z: Math.sign(c) };
}

/**
 * Коробка в системі Клітки: `along` — від центра до дверей, `across` — вбік, `y` — від підлоги.
 * Півпротяжності `hAlong`, `hAcross`, `hy` — уздовж тих самих осей.
 */
function box(cage: CageSpawn, along: number, across: number, y: number, hAlong: number, hAcross: number, hy: number): Block {
  const d = doorSide(cage.facing);
  const onX = d.x !== 0;
  const x = onX ? along * d.x : across;
  const z = onX ? across : along * d.z;
  return {
    kind: 'solid',
    center: { x: cage.position.x + x, y: cage.position.y + y, z: cage.position.z + z },
    halfExtents: onX ? { x: hAlong, y: hy, z: hAcross } : { x: hAcross, y: hy, z: hAlong },
  };
}

/** Стінка Клітки з боку `facing`. */
export function cageDoor(cage: CageSpawn, tuning: Tuning = TUNING): Block {
  const { cageSize: size, cageWall: wall } = tuning.village;
  const half = size / 2;
  return box(cage, half - wall / 2, 0, (size - wall) / 2, wall / 2, half, (size - wall) / 2);
}

/** Стінки й дах Клітки: куб `cageSize` над `position`; відкрита — без дверей. */
export function cageBlocks(cage: CageSpawn, open: boolean, tuning: Tuning = TUNING): Block[] {
  const { cageSize: size, cageWall: wall } = tuning.village;
  const half = size / 2;
  const wallY = (size - wall) / 2;
  const blocks: Block[] = [
    box(cage, -(half - wall / 2), 0, wallY, wall / 2, half, wallY), // задня
    box(cage, 0, half - wall / 2, wallY, half - wall, wall / 2, wallY), // бічні
    box(cage, 0, -(half - wall / 2), wallY, half - wall, wall / 2, wallY),
    box(cage, 0, 0, size - wall / 2, half, half, wall / 2), // дах
  ];
  return open ? blocks : [...blocks, cageDoor(cage, tuning)];
}

/** Ніжка Квітки: суцільний стовпчик нижчий за бутон. */
export function stemBlock(flower: FlowerSpawn, tuning: Tuning): Block {
  const { flowerStemTop: top, flowerStemHalfWidth: hw } = tuning.village;
  return {
    kind: 'solid',
    look: 'stem',
    center: { x: flower.position.x, y: flower.position.y + top / 2, z: flower.position.z },
    halfExtents: { x: hw, y: top / 2, z: hw },
  };
}

/** Нерухомі блоки: блоки рівня, Клітки (відкриті — без дверей) і ніжки Квіток. */
export function staticBlocks(level: Level, openCages: ReadonlySet<string>, tuning: Tuning): Block[] {
  return [
    ...level.blocks,
    ...(level.cages ?? []).flatMap((c) => cageBlocks(c, openCages.has(c.id), tuning)),
    ...(level.flowers ?? []).map((f) => stemBlock(f, tuning)),
  ];
}

/** Усе, що стоїть у світі на старті: нерухомі блоки, рухомі платформи в точці A і казан Джерела. */
export function levelBlocks(level: Level, openCages: ReadonlySet<string>, tuning: Tuning): Block[] {
  return [
    ...staticBlocks(level, openCages, tuning),
    ...(level.movers ?? []).map((m) => m.block),
    ...(level.source ? [sourceBlock(level.source, tuning)] : []),
  ];
}
