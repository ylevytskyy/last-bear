import type { Input } from '../sim/input';
import type { Vec3 } from '../sim/level';
import { TUNING, type Tuning } from '../sim/tuning';

export type CameraPose = { position: Vec3; lookAt: Vec3; yaw: number };

/** Запас між камерою і стіною, м. */
const WALL_MARGIN = 0.2;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Куди камері повертатись. Іде за поглядом Софійки, лише коли вона йде від камери;
 * збоку чи до камери — тримає курс, інакше керування крутилось би по колу.
 */
export function cameraHeading(input: Input, cameraYaw: number, facing: number): number {
  const away = input.moveX * Math.sin(cameraYaw) + input.moveZ * Math.cos(cameraYaw);
  return away > 0.3 ? facing : cameraYaw;
}

/** Найбільший поворот камери за один кадр, рад. */
const MAX_TURN_PER_FRAME = Math.PI / 2;

/**
 * Камера позаду й вище за Софійку; не заходить у суцільні блоки (`clear` — відстань променя до них).
 * `headingOverride` — курс замість `facing` (після Рефлексу камера обходить за новим поглядом).
 */
export function followCamera(
  prev: CameraPose,
  target: Vec3,
  facing: number,
  dt: number,
  clear: (from: Vec3, dir: Vec3, max: number) => number,
  tuning: Tuning = TUNING,
  headingOverride?: number,
): CameraPose {
  const heading = headingOverride ?? facing;
  const turn = wrap(heading - prev.yaw) * (1 - Math.exp(-tuning.cameraTurnRate * dt));
  const yaw = wrap(prev.yaw + Math.max(-MAX_TURN_PER_FRAME, Math.min(MAX_TURN_PER_FRAME, turn)));
  const lookAt = { x: target.x, y: target.y + tuning.cameraLookHeight, z: target.z };

  const back = { x: -Math.sin(yaw) * tuning.cameraDistance, y: tuning.cameraHeight - tuning.cameraLookHeight, z: -Math.cos(yaw) * tuning.cameraDistance };
  const length = Math.hypot(back.x, back.y, back.z);
  const dir = { x: back.x / length, y: back.y / length, z: back.z / length };
  const reach = Math.max(0, Math.min(length, clear(lookAt, dir, length) - WALL_MARGIN));

  return {
    position: { x: lookAt.x + dir.x * reach, y: lookAt.y + dir.y * reach, z: lookAt.z + dir.z * reach },
    lookAt,
    yaw,
  };
}

/**
 * Камера мишею: за Софійкою по рисканню `look.yaw`, вище на нахил `look.pitch`, на `cameraDistance`;
 * дивиться на точку `cameraLookHeight` над `target`. Суцільна стіна підтягує камеру ближче.
 */
export function orbitCamera(
  target: Vec3,
  look: { yaw: number; pitch: number },
  clear: (from: Vec3, dir: Vec3, max: number) => number,
  tuning: Tuning = TUNING,
): CameraPose {
  const lookAt = { x: target.x, y: target.y + tuning.cameraLookHeight, z: target.z };
  const cos = Math.cos(look.pitch);
  const dir = { x: -Math.sin(look.yaw) * cos, y: Math.sin(look.pitch), z: -Math.cos(look.yaw) * cos };
  const hit = clear(lookAt, dir, tuning.cameraDistance);
  const reach = hit < tuning.cameraDistance ? Math.max(0, hit - WALL_MARGIN) : tuning.cameraDistance;
  return {
    position: { x: lookAt.x + dir.x * reach, y: lookAt.y + dir.y * reach, z: lookAt.z + dir.z * reach },
    lookAt,
    yaw: look.yaw,
  };
}
