import { describe, expect, it } from 'vitest';
import { BEAR_PROPORTIONS, bearLayout, type BearProportions } from './layout';

const scaled = (factor: number): BearProportions => ({
  ...BEAR_PROPORTIONS,
  torsoRadius: BEAR_PROPORTIONS.torsoRadius * factor,
  headRadius: BEAR_PROPORTIONS.headRadius * factor,
  legLength: BEAR_PROPORTIONS.legLength * factor,
  legRadius: BEAR_PROPORTIONS.legRadius * factor,
  armLength: BEAR_PROPORTIONS.armLength * factor,
  armRadius: BEAR_PROPORTIONS.armRadius * factor,
});

describe('bearLayout', () => {
  const layout = bearLayout();

  it('puts the hip joint one leg length above the ground', () => {
    expect(layout.hip.y).toBeCloseTo(BEAR_PROPORTIONS.legLength);
  });

  it('tucks the legs into the torso', () => {
    expect(layout.torsoCenterY - layout.torsoHalfHeight).toBeLessThan(layout.hip.y);
  });

  it('keeps shoulders in the upper half of the torso', () => {
    expect(layout.shoulder.y).toBeGreaterThan(layout.torsoCenterY);
    expect(layout.shoulder.y).toBeLessThan(layout.torsoCenterY + layout.torsoHalfHeight);
  });

  it('attaches the neck near the top of the torso', () => {
    const top = layout.torsoCenterY + layout.torsoHalfHeight;
    expect(layout.neckY).toBeLessThanOrEqual(top);
    expect(layout.neckY).toBeGreaterThan(layout.torsoCenterY);
  });

  it('derives every position from the proportions (scales uniformly)', () => {
    const double = bearLayout(scaled(2));
    expect(double.totalHeight).toBeCloseTo(layout.totalHeight * 2);
    expect(double.shoulder.x).toBeCloseTo(layout.shoulder.x * 2);
    expect(double.tail.z).toBeCloseTo(layout.tail.z * 2);
  });
});
