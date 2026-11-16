import { describe, expect, it } from 'vitest';
import type { FlowerSpawn, Vec3 } from './level';
import { entersFlower, stepFlower } from './flowers';
import { TUNING } from './tuning';

const DT = TUNING.step;
const V = TUNING.village;

describe('stepFlower', () => {
  it('a flower that opens grows to 1 in flowerOpenSeconds while she is nearer than flowerOpenRadius', () => {
    let o = 0;
    for (let i = 0; i < 24; i++) o = stepFlower(o, true, 3, DT, TUNING);
    expect(o).toBeCloseTo(0.5, 6);
    for (let i = 0; i < 24; i++) o = stepFlower(o, true, 3, DT, TUNING);
    expect(o).toBeCloseTo(1, 6);
    expect(stepFlower(o, true, 3, DT, TUNING)).toBe(1); // вище одиниці не росте
  });

  it('closes at the same speed once she is farther than flowerOpenRadius, and not below 0', () => {
    let o = 1;
    for (let i = 0; i < 24; i++) o = stepFlower(o, true, 10, DT, TUNING);
    expect(o).toBeCloseTo(0.5, 6);
    for (let i = 0; i < 40; i++) o = stepFlower(o, true, 10, DT, TUNING);
    expect(o).toBe(0);
  });

  it('opens just inside flowerOpenRadius and not just outside it', () => {
    expect(stepFlower(0, true, V.flowerOpenRadius - 0.01, DT, TUNING)).toBeGreaterThan(0);
    expect(stepFlower(0, true, V.flowerOpenRadius + 0.01, DT, TUNING)).toBe(0);
  });

  it('a flower that does not open stays at 0 whatever the distance, even if it was somehow open', () => {
    expect(stepFlower(0, false, 0, DT, TUNING)).toBe(0);
    expect(stepFlower(0, false, 1, 100, TUNING)).toBe(0);
    expect(stepFlower(0.7, false, 1, DT, TUNING)).toBe(0);
  });
});

describe('entersFlower', () => {
  const flower = (y = 0): FlowerSpawn => ({ id: 'f', position: { x: 2, y, z: 3 }, color: 'yellow', opens: true });
  const at = (dx: number, y: number, grounded = false, dz = 0, base = 0): { position: Vec3; grounded: boolean } => ({
    position: { x: 2 + dx, y: base + y, z: 3 + dz },
    grounded,
  });
  const bud = V.flowerBudHeight;

  it('is true when she comes down through the bud height, in the air, within flowerEnterRadius, with the flower open', () => {
    expect(entersFlower(bud + 0.05, at(0.8, bud - 0.05), flower(), 1, TUNING)).toBe(true);
    expect(entersFlower(bud + 0.05, at(0, bud - 0.05), flower(), 1, TUNING)).toBe(true);
  });

  it('counts the bud height from the flower base, not from zero', () => {
    expect(entersFlower(2 + bud + 0.05, at(0.8, bud - 0.05, false, 0, 2), flower(2), 1, TUNING)).toBe(true);
    expect(entersFlower(bud + 0.05, at(0.8, bud - 0.05), flower(2), 1, TUNING)).toBe(false);
  });

  it('needs openness of at least 0.9', () => {
    expect(entersFlower(bud + 0.05, at(0.8, bud - 0.05), flower(), 0.9, TUNING)).toBe(true);
    expect(entersFlower(bud + 0.05, at(0.8, bud - 0.05), flower(), 0.89, TUNING)).toBe(false);
    expect(entersFlower(bud + 0.05, at(0.8, bud - 0.05), flower(), 0, TUNING)).toBe(false);
  });

  it('is false on the ground', () => {
    expect(entersFlower(bud + 0.05, at(0.8, bud - 0.05, true), flower(), 1, TUNING)).toBe(false);
  });

  it('needs the soles to have crossed the bud height downwards on this step', () => {
    expect(entersFlower(bud, at(0.8, bud - 0.01), flower(), 1, TUNING)).toBe(true); // прийшла рівно з висоти бутона
    expect(entersFlower(bud + 0.05, at(0.8, bud), flower(), 1, TUNING)).toBe(false); // ще не нижче
    expect(entersFlower(bud + 0.3, at(0.8, bud + 0.2), flower(), 1, TUNING)).toBe(false); // ще над бутоном
    expect(entersFlower(bud - 0.2, at(0.8, bud - 0.3), flower(), 1, TUNING)).toBe(false); // вже була нижче
    expect(entersFlower(bud - 0.05, at(0.8, bud + 0.05), flower(), 1, TUNING)).toBe(false); // летить угору
  });

  it('needs her to be within flowerEnterRadius of the centre on the xz plane', () => {
    expect(entersFlower(bud + 0.05, at(V.flowerEnterRadius - 0.01, bud - 0.05), flower(), 1, TUNING)).toBe(true);
    expect(entersFlower(bud + 0.05, at(V.flowerEnterRadius + 0.01, bud - 0.05), flower(), 1, TUNING)).toBe(false);
    // по xz, а не лише по x: діагональ
    expect(entersFlower(bud + 0.05, at(V.flowerEnterRadius * 0.8, bud - 0.05, false, V.flowerEnterRadius * 0.8), flower(), 1, TUNING)).toBe(false);
    expect(entersFlower(bud + 0.05, at(0, bud - 0.05, false, V.flowerEnterRadius - 0.1), flower(), 1, TUNING)).toBe(true);
  });
});
