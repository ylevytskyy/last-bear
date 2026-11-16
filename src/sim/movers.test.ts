import { describe, expect, it } from 'vitest';
import { moverPosition } from './movers';
import type { Vec3 } from './level';

const A: Vec3 = { x: 2, y: 0.5, z: -1 };
const B: Vec3 = { x: 8, y: 2.5, z: 3 };
const V = 1.5;
const LENGTH = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('moverPosition: there and back at a constant speed', () => {
  it('is A at t = 0, B after one length, and A again after two', () => {
    expect(moverPosition(A, B, 0, V)).toEqual(A);
    const atB = moverPosition(A, B, LENGTH / V, V);
    expect(dist(atB, B)).toBeLessThan(1e-9);
    const back = moverPosition(A, B, (2 * LENGTH) / V, V);
    expect(dist(back, A)).toBeLessThan(1e-9);
  });

  it('is half way along the segment at half the time, in both directions', () => {
    const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: (A.z + B.z) / 2 };
    expect(dist(moverPosition(A, B, LENGTH / 2 / V, V), mid)).toBeLessThan(1e-9);
    expect(dist(moverPosition(A, B, (1.5 * LENGTH) / V, V), mid)).toBeLessThan(1e-9);
  });

  it('moves at most speed / 60 + 1e-9 per frame over several round trips, and never leaves the segment', () => {
    let prev = moverPosition(A, B, 0, V);
    let maxStep = 0;
    let turned = 0;
    for (let i = 1; i <= 60 * 30; i++) {
      const p = moverPosition(A, B, i / 60, V);
      const step = dist(p, prev);
      maxStep = Math.max(maxStep, step);
      expect(step).toBeLessThanOrEqual(V / 60 + 1e-9);
      // На відрізку: відстані до кінців у сумі дають довжину.
      expect(dist(p, A) + dist(p, B)).toBeCloseTo(LENGTH, 9);
      if (dist(p, B) < V / 60) turned++;
      prev = p;
    }
    expect(maxStep).toBeGreaterThan(V / 60 - 1e-6); // рухається саме з цією швидкістю, а не повзе
    expect(turned).toBeGreaterThan(0);
  });

  it('keeps the same speed on the way back as on the way there', () => {
    const t = LENGTH / V;
    const there = dist(moverPosition(A, B, t / 2 + 1 / 60, V), moverPosition(A, B, t / 2, V));
    const back = dist(moverPosition(A, B, t + t / 2 + 1 / 60, V), moverPosition(A, B, t + t / 2, V));
    expect(back).toBeCloseTo(there, 9);
  });

  it('stays put when A and B are the same point', () => {
    expect(moverPosition(A, A, 12.3, V)).toEqual(A);
  });
});
