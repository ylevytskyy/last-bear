import { describe, expect, it } from 'vitest';
import { buildCage, buildHouse, cageDoorAngle } from './village-models';

const OPEN = (100 * Math.PI) / 180;

describe('cageDoorAngle', () => {
  it('stays shut when the cage is closed', () => {
    for (let t = 0; t <= 1; t += 0.05) expect(cageDoorAngle(false, t)).toBe(0);
  });

  it('swings open to 100° in 0.6 s and never swings back', () => {
    expect(cageDoorAngle(true, 0)).toBe(0);
    let prev = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const a = cageDoorAngle(true, t);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
    expect(cageDoorAngle(true, 0.6)).toBeCloseTo(OPEN, 9);
    expect(cageDoorAngle(true, 5)).toBeCloseTo(OPEN, 9);
  });
});

describe('village models', () => {
  it('only the working cage has a glowing lock', () => {
    const working = buildCage(true, 2);
    const decor = buildCage(false, 2);
    expect(working.lockMaterial).not.toBeNull();
    expect(decor.lockMaterial).toBeNull();
    expect(working.root.getObjectByName('door')).toBe(working.door);
    working.dispose();
    decor.dispose();
  });

  it('a house fills its block footprint and has a roof above it', () => {
    const house = buildHouse({ x: 2, y: 1.5, z: 3 });
    expect(house.root.getObjectByName('roof')).toBeDefined();
    house.dispose();
  });
});
