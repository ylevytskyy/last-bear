import type { WorldId } from '../sim/level';

export type WorldLook = {
  background: string;
  fog: { color: string; near: number; far: number };
  ground: string;
  wall: string;
  /** Колір і сила розсіяного світла. */
  ambient: { color: string; intensity: number };
  /** Колір і сила «сонця» (у Залаштунках — ламп). */
  sun: { color: string; intensity: number };
};

/** Вигляд кожного світу: Залаштунки жовті з холодним світлом ламп, Стільники — небо й мед, Селище — вечір і фіолетовий туман. */
export function worldLook(world: WorldId): WorldLook {
  switch (world) {
    case 'backrooms':
      return {
        background: '#3b3418',
        fog: { color: '#6b6230', near: 10, far: 40 },
        ground: '#a8955a',
        wall: '#d9c46a',
        ambient: { color: '#fff6c8', intensity: 1.6 },
        sun: { color: '#f2f6ff', intensity: 1.6 },
      };
    case 'honeycombs':
      return {
        background: '#7fb8ec',
        fog: { color: '#a9d2f5', near: 35, far: 110 },
        ground: '#e7a92f',
        wall: '#c88a1c',
        ambient: { color: '#e6f2ff', intensity: 1.5 },
        sun: { color: '#fff1c9', intensity: 2.6 },
      };
    default:
      return {
        background: '#1a1a2b',
        fog: { color: '#5a3a78', near: 20, far: 65 },
        ground: '#5b5b78',
        wall: '#6a6a86',
        ambient: { color: '#8a8aa8', intensity: 1.4 },
        sun: { color: '#ffe9c4', intensity: 2.2 },
      };
  }
}
