import { describe, expect, it } from 'vitest';
import { TUNING } from '../sim/tuning';
import { bubbleFrame, bubbleFrames, bubbleVisible, trailPoints } from './guide-fx';

describe('Bubble', () => {
  it('shows the next step for each stage of the story', () => {
    expect(bubbleFrames('needKey')).toEqual(['cage', 'key', 'flower']);
    expect(bubbleFrames('haveKey')).toEqual(['key', 'cage']);
    expect(bubbleFrames('freed')).toEqual(['heart']);
  });

  it('cycles the pictures, each for frameSeconds', () => {
    const f = ['cage', 'key', 'flower'];
    expect([0, 1.2, 2.4, 3.6].map((t) => bubbleFrame(f, t, 1.2))).toEqual(['cage', 'key', 'flower', 'cage']);
    expect(bubbleFrame(f, 1.19, 1.2)).toBe('cage');
  });

  it('is visible only within the talk radius of the survivor', () => {
    const survivor = { x: 0, y: 0, z: 0 };
    expect(bubbleVisible({ x: 4.9, y: 0, z: 0 }, survivor, TUNING)).toBe(true);
    expect(bubbleVisible({ x: 5.1, y: 0, z: 0 }, survivor, TUNING)).toBe(false);
    expect(bubbleVisible({ x: 3, y: 9, z: 3 }, survivor, TUNING)).toBe(true); // по xz
  });
});

describe('trailPoints', () => {
  it('spreads points along the polyline: ends included, even spacing, a shorter last gap', () => {
    const path = [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }, { x: 6, y: 0, z: 4.5 }]; // 10.5 м
    const pts = trailPoints(path, 1);
    expect(pts).toHaveLength(12);
    expect(pts[0]).toEqual(path[0]);
    expect(pts.at(-1)).toEqual(path[2]);
    const gaps = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.z - pts[i]!.z));
    // Відстань уздовж ламаної: на зламі пряма відстань менша, тому перевіряємо довжину шляху.
    const along = (p: { x: number; z: number }) => (p.z === 0 ? p.x : 6 + p.z);
    const steps = pts.slice(1).map((p, i) => along(p) - along(pts[i]!));
    for (const s of steps.slice(0, -1)) expect(s).toBeCloseTo(1, 9);
    expect(steps.at(-1)).toBeCloseTo(0.5, 9);
    expect(gaps.every((g) => g <= 1 + 1e-9)).toBe(true);
  });

  it('gives nothing for an empty path', () => {
    expect(trailPoints([], 1)).toEqual([]);
  });
});
