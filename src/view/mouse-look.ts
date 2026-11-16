/** Камера мишею: рискання і нахил. Числа налаштування камери — тут, бо це лише показ. */
export const LOOK = {
  /** Радіан на піксель руху миші. */
  sensitivity: 0.0032,
  minPitch: (5 * Math.PI) / 180,
  maxPitch: (55 * Math.PI) / 180,
  /** Поворот стрілками вліво/вправо, рад/с. */
  keyTurnRate: 2.4,
  /** Швидкість, з якою камера доганяє висоту Софійки, 1/с. */
  heightRate: 9,
} as const;

export type Look = { yaw: number; pitch: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Рух миші на (dx, dy) пікселів: праворуч — камера праворуч, вниз — дивиться згори. */
export function applyMouse(look: Look, dx: number, dy: number): Look {
  return { yaw: look.yaw - dx * LOOK.sensitivity, pitch: clamp(look.pitch + dy * LOOK.sensitivity, LOOK.minPitch, LOOK.maxPitch) };
}

/** Стрілки вліво/вправо крутять камеру (для гри без миші). */
export function turnWithKeys(look: Look, pressed: ReadonlySet<string>, dt: number): Look {
  const turn = (pressed.has('ArrowLeft') ? 1 : 0) - (pressed.has('ArrowRight') ? 1 : 0);
  return turn === 0 ? look : { ...look, yaw: look.yaw + turn * LOOK.keyTurnRate * dt };
}

/** Висота точки, за якою стежить камера: плавно доганяє Софійку, щоб стрибок не смикав картинку. */
export function followHeight(current: number, target: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-LOOK.heightRate * dt));
}
