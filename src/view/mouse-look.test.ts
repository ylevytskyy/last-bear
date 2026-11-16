import { describe, expect, it } from 'vitest';
import { applyMouse, followHeight, turnWithKeys, LOOK } from './mouse-look';

describe('mouse look', () => {
  it('turns the camera by an amount proportional to the mouse move; right turns right', () => {
    const a = applyMouse({ yaw: 0, pitch: 0.4 }, 100, 0);
    const b = applyMouse({ yaw: 0, pitch: 0.4 }, 200, 0);
    expect(b.yaw).toBeCloseTo(2 * a.yaw, 9);
    // Камера дивиться вздовж +z; праворуч на екрані — −x, тобто рискання зменшується.
    expect(a.yaw).toBeLessThan(0);
  });

  it('keeps the tilt between 5° and 55°', () => {
    expect(applyMouse({ yaw: 0, pitch: 0.4 }, 0, 10_000).pitch).toBeCloseTo(LOOK.maxPitch, 9);
    expect(applyMouse({ yaw: 0, pitch: 0.4 }, 0, -10_000).pitch).toBeCloseTo(LOOK.minPitch, 9);
    expect(LOOK.minPitch).toBeCloseTo((5 * Math.PI) / 180, 9);
    expect(LOOK.maxPitch).toBeCloseTo((55 * Math.PI) / 180, 9);
  });

  it('left and right arrow keys turn the camera without a mouse', () => {
    const left = turnWithKeys({ yaw: 0, pitch: 0.4 }, new Set(['ArrowLeft']), 0.5);
    const right = turnWithKeys({ yaw: 0, pitch: 0.4 }, new Set(['ArrowRight']), 0.5);
    expect(left.yaw).toBeGreaterThan(0);
    expect(right.yaw).toBeLessThan(0);
    expect(turnWithKeys({ yaw: 1, pitch: 0.4 }, new Set(['KeyA']), 0.5).yaw).toBe(1);
  });

  it('follows a jump smoothly: no more than 0.15 m of camera height change in one 1/60 s frame', () => {
    let h = 0;
    let maxStep = 0;
    // Висота Софійки за стрибок: парабола 1.7 м за 0.9 с.
    for (let i = 0; i <= 54; i++) {
      const t = i / 60;
      const target = Math.max(0, 1.7 - 1.7 * ((t - 0.45) / 0.45) ** 2);
      const next = followHeight(h, target, 1 / 60);
      maxStep = Math.max(maxStep, Math.abs(next - h));
      h = next;
    }
    expect(maxStep).toBeLessThanOrEqual(0.15);
    expect(followHeight(0, 2, 10)).toBeCloseTo(2, 3); // зрештою доганяє
  });
});
