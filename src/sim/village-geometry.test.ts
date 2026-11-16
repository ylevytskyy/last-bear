import { describe, expect, it } from 'vitest';
import type { Block, CageSpawn, FlowerSpawn, Level } from './level';
import { cageBlocks, cageDoor, levelBlocks, stemBlock } from './village-geometry';
import { TUNING } from './tuning';

const SIZE = TUNING.village.cageSize;
const HALF = SIZE / 2;
const cage = (facing: number): CageSpawn => ({ id: 'c', position: { x: 3, y: 0.5, z: -7 }, facing, working: true });
const bounds = (blocks: Block[]) => ({
  lo: {
    x: Math.min(...blocks.map((b) => b.center.x - b.halfExtents.x)),
    y: Math.min(...blocks.map((b) => b.center.y - b.halfExtents.y)),
    z: Math.min(...blocks.map((b) => b.center.z - b.halfExtents.z)),
  },
  hi: {
    x: Math.max(...blocks.map((b) => b.center.x + b.halfExtents.x)),
    y: Math.max(...blocks.map((b) => b.center.y + b.halfExtents.y)),
    z: Math.max(...blocks.map((b) => b.center.z + b.halfExtents.z)),
  },
});
const FACINGS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

describe('cageBlocks', () => {
  it.each(FACINGS)('a closed cage facing %f is five solid blocks bounding a cube of cageSize above its position', (facing) => {
    const c = cage(facing);
    const blocks = cageBlocks(c, false);
    expect(blocks).toHaveLength(5);
    expect(blocks.every((b) => b.kind === 'solid' && b.look === undefined)).toBe(true);
    const { lo, hi } = bounds(blocks);
    expect(lo.x).toBeCloseTo(c.position.x - HALF, 9);
    expect(hi.x).toBeCloseTo(c.position.x + HALF, 9);
    expect(lo.z).toBeCloseTo(c.position.z - HALF, 9);
    expect(hi.z).toBeCloseTo(c.position.z + HALF, 9);
    expect(lo.y).toBeCloseTo(c.position.y, 9);
    expect(hi.y).toBeCloseTo(c.position.y + SIZE, 9);
  });

  it.each(FACINGS)('an open cage facing %f has four blocks: the wall on the facing side is gone, the cube is still bounded', (facing) => {
    const c = cage(facing);
    const closed = cageBlocks(c, false);
    const open = cageBlocks(c, true);
    expect(open).toHaveLength(4);
    const door = cageDoor(c);
    // Двері — стінка з боку `facing`: її центр зсунутий від центру Клітки саме туди.
    const toward = { x: Math.sin(facing), z: Math.cos(facing) };
    const offset = (door.center.x - c.position.x) * toward.x + (door.center.z - c.position.z) * toward.z;
    expect(offset).toBeGreaterThan(HALF - TUNING.village.cageWall);
    expect(closed).toContainEqual(door);
    expect(open).not.toContainEqual(door);
    // Решта блоків закритої Клітки — та сама відкрита.
    expect(closed.filter((b) => !open.some((o) => JSON.stringify(o) === JSON.stringify(b)))).toEqual([door]);
    const a = bounds(open);
    const b = bounds(closed);
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(a.lo[axis]).toBeCloseTo(b.lo[axis], 9);
      expect(a.hi[axis]).toBeCloseTo(b.hi[axis], 9);
    }
  });
});

describe('cage walls', () => {
  it('stand on the floor and reach the roof, with no gap to crawl through', () => {
    const c = cage(Math.PI);
    const blocks = cageBlocks(c, false);
    const roof = blocks.reduce((top, b) => (b.center.y > top.center.y ? b : top));
    const walls = blocks.filter((b) => b !== roof);
    expect(walls).toHaveLength(4);
    for (const w of walls) {
      expect(w.center.y - w.halfExtents.y).toBeCloseTo(c.position.y, 9);
      expect(w.center.y + w.halfExtents.y).toBeCloseTo(roof.center.y - roof.halfExtents.y, 9);
    }
  });
});

describe('stemBlock', () => {
  it('is a solid post under the flower, lower than the bud, looking like a stem', () => {
    const flower: FlowerSpawn = { id: 'f', position: { x: 14, y: 0.2, z: 5 }, color: 'yellow', opens: true };
    const b = stemBlock(flower, TUNING);
    expect(b.kind).toBe('solid');
    expect(b.look).toBe('stem');
    expect(b.center).toEqual({ x: 14, y: 0.2 + TUNING.village.flowerStemTop / 2, z: 5 });
    expect(b.halfExtents).toEqual({
      x: TUNING.village.flowerStemHalfWidth,
      y: TUNING.village.flowerStemTop / 2,
      z: TUNING.village.flowerStemHalfWidth,
    });
    expect(b.center.y + b.halfExtents.y).toBeLessThan(flower.position.y + TUNING.village.flowerBudHeight);
  });
});

describe('levelBlocks', () => {
  const floor: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 20, y: 0.5, z: 20 } };
  const cages: CageSpawn[] = [
    { id: 'a', position: { x: -4, y: 0, z: 10 }, facing: Math.PI, working: false },
    { id: 'b', position: { x: 4, y: 0, z: 10 }, facing: Math.PI, working: true },
  ];
  const flowers: FlowerSpawn[] = [{ id: 'f', position: { x: 10, y: 0, z: 0 }, color: 'pink', opens: false }];
  const level: Level = { blocks: [floor], spawn: { x: 0, y: 0, z: 0 }, killY: -10, cages, flowers };

  it('is the level blocks, every cage and every stem; an opened cage loses its door', () => {
    expect(levelBlocks(level, new Set(), TUNING)).toHaveLength(1 + 5 + 5 + 1);
    expect(levelBlocks(level, new Set(['b']), TUNING)).toHaveLength(1 + 5 + 4 + 1);
    expect(levelBlocks(level, new Set(), TUNING)).toContainEqual(cageDoor(cages[1]!));
    expect(levelBlocks(level, new Set(['b']), TUNING)).not.toContainEqual(cageDoor(cages[1]!));
    expect(levelBlocks(level, new Set(['b']), TUNING)).toContainEqual(cageDoor(cages[0]!));
  });

  it('is just the blocks for a level without cages or flowers', () => {
    expect(levelBlocks({ blocks: [floor], spawn: { x: 0, y: 0, z: 0 }, killY: -1 }, new Set(), TUNING)).toEqual([floor]);
  });
});
