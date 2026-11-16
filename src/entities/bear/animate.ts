import type { BearRig } from './build-bear';

const BREATH_SPEED = 2; // radians per second
const BREATH_AMOUNT = 0.03; // fraction of torso height
const HEAD_TILT = 0.07;
const HEAD_TURN = 0.18;
const ARM_REST_SPREAD = 0.22;
const ARM_SWAY = 0.06;
const ARM_SWING = 0.7;
const LEG_SWING = 0.6;
const WALK_BOB = 0.05; // fraction of leg length

/**
 * Poses the bear for a moment in time. Idle: breathing, a slow head sway and
 * gently swaying arms. `walk` (0..1) blends in a walk cycle driven by `walkPhase`.
 * Returns the walk bob height; the caller adds it to wherever the bear stands (the root is not moved,
 * so a bear in the air stays in the air).
 */
export function animateBear(rig: BearRig, time: number, walk = 0, walkPhase = 0, pose?: { armSwing: number }): number {
  const { layout, proportions } = rig;
  const breath = Math.sin(time * BREATH_SPEED);
  const stretch = 1 + breath * BREATH_AMOUNT;

  // Chest rises and widens slightly; the head rides on top of the stretched torso.
  rig.torso.scale.set(1, stretch, 1 + breath * BREATH_AMOUNT);
  rig.headGroup.position.y = layout.neckY + layout.torsoHalfHeight * (stretch - 1);

  const idle = 1 - walk;
  rig.headGroup.rotation.z = Math.sin(time * 1.1) * HEAD_TILT;
  rig.headGroup.rotation.y = Math.sin(time * 0.6) * HEAD_TURN * idle;

  const stride = Math.sin(walkPhase) * walk;
  const sway = breath * ARM_SWAY * idle;

  rig.leftLeg.rotation.x = stride * LEG_SWING;
  rig.rightLeg.rotation.x = -stride * LEG_SWING;
  // Arms swing against the leg on the same side, as in a natural walk.
  rig.leftArm.rotation.x = -stride * ARM_SWING + sway;
  // Удар: права лапа вперед — від'ємний поворот навколо x (модель дивиться в +z).
  rig.rightArm.rotation.x = stride * ARM_SWING + sway - (pose?.armSwing ?? 0);
  rig.leftArm.rotation.z = ARM_REST_SPREAD + sway;
  rig.rightArm.rotation.z = -ARM_REST_SPREAD - sway;

  return Math.abs(Math.sin(walkPhase)) * walk * WALK_BOB * proportions.legLength;
}
