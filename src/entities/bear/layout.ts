/** The only absolute sizes of the bear. Every position is derived from these in `bearLayout`. */
export const BEAR_PROPORTIONS = {
  torsoRadius: 0.42,
  /** Torso is a sphere stretched vertically and squashed front-to-back. */
  torsoStretchY: 1.1,
  torsoStretchZ: 0.9,
  headRadius: 0.36,
  legLength: 0.42,
  legRadius: 0.14,
  armLength: 0.5,
  armRadius: 0.11,
} as const;

export type BearProportions = { [K in keyof typeof BEAR_PROPORTIONS]: number };

export type BearLayout = ReturnType<typeof bearLayout>;

/**
 * Joint and attachment positions in bearRoot space (y = 0 is the soles of the feet,
 * +z is the direction the bear faces, +x is its left).
 */
export function bearLayout(p: BearProportions = BEAR_PROPORTIONS) {
  const torsoHalfHeight = p.torsoRadius * p.torsoStretchY;
  const torsoHalfDepth = p.torsoRadius * p.torsoStretchZ;

  const hipY = p.legLength;
  // The lower quarter of the torso overlaps the legs so the hips are hidden inside it.
  const torsoCenterY = hipY + torsoHalfHeight * 0.75;
  const torsoTopY = torsoCenterY + torsoHalfHeight;

  const neckY = torsoTopY - p.headRadius * 0.2;
  /** Head centre, local to headGroup (whose origin is the neck). */
  const headCenterY = p.headRadius * 0.8;

  return {
    torsoHalfHeight,
    torsoHalfDepth,
    torsoCenterY,
    hip: { x: p.torsoRadius * 0.5, y: hipY },
    shoulder: { x: p.torsoRadius * 0.9, y: torsoCenterY + torsoHalfHeight * 0.45 },
    neckY,
    headCenterY,
    tail: {
      y: torsoCenterY - torsoHalfHeight * 0.5,
      z: -torsoHalfDepth * 0.9,
      radius: p.torsoRadius * 0.24,
    },
    totalHeight: neckY + headCenterY + p.headRadius,
  };
}
