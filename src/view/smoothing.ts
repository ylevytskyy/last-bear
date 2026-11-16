import type { Vec3 } from '../sim/level';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Точка між станом правил до кроку (`a`) і після (`b`): показ малює між кроками, а не стрибками по 1/60 с. */
export function lerpVec3(a: Vec3, b: Vec3, alpha: number): Vec3 {
  const k = clamp01(alpha);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
}

/** Кут між `a` і `b` коротшим шляхом. */
export function lerpAngle(a: number, b: number, alpha: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * clamp01(alpha);
}

/** Стан для згладжування: позиції до останнього кроку правил. */
export type Previous = {
  sofiyka: { position: Vec3; facing: number };
  enemies: Map<string, Vec3>;
  movers: Map<string, Vec3>;
};
