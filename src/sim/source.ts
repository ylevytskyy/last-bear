import type { Block, SourceSpawn, Vec3 } from './level';
import type { Tuning } from './tuning';

/** Куди Ключ падає, якщо Софійка стоїть просто над центром казана (напрямок «до неї» не визначений): на південь. */
const FALLBACK_DIRECTION = { x: 0, z: -1 };

/** Суцільний куб казана: і в світі правил, і в `levelBlocks`, і в показі — той самий блок. */
export function sourceBlock(spawn: SourceSpawn, tuning: Tuning): Block {
  const { halfWidth, height } = tuning.source;
  return {
    kind: 'solid',
    look: 'source',
    center: { x: spawn.position.x, y: spawn.position.y + height / 2, z: spawn.position.z },
    halfExtents: { x: halfWidth, y: height / 2, z: halfWidth },
  };
}

/** Чи торкається куля Удару (центр і радіус) куба казана. */
export function strikeHitsSource(strikeCenter: Vec3, strikeRadius: number, spawn: SourceSpawn, tuning: Tuning): boolean {
  const b = sourceBlock(spawn, tuning);
  const clamp = (v: number, c: number, h: number) => Math.min(c + h, Math.max(c - h, v));
  const dx = strikeCenter.x - clamp(strikeCenter.x, b.center.x, b.halfExtents.x);
  const dy = strikeCenter.y - clamp(strikeCenter.y, b.center.y, b.halfExtents.y);
  const dz = strikeCenter.z - clamp(strikeCenter.z, b.center.z, b.halfExtents.z);
  return Math.hypot(dx, dy, dz) <= strikeRadius + 1e-9;
}

/** Де лежить Ключ, що випав: за `keyDropDistance` від центра казана в бік Софійки, на землі, на якій стоїть казан. */
export function keyDropAt(spawn: SourceSpawn, sofiyka: Vec3, tuning: Tuning): Vec3 {
  const dx = sofiyka.x - spawn.position.x;
  const dz = sofiyka.z - spawn.position.z;
  const len = Math.hypot(dx, dz);
  const dir = len > 1e-9 ? { x: dx / len, z: dz / len } : FALLBACK_DIRECTION;
  // За стінку казана на `keyDropDistance` у будь-якому напрямку (до кута куба теж).
  const d = tuning.source.halfWidth / Math.max(Math.abs(dir.x), Math.abs(dir.z)) + tuning.source.keyDropDistance;
  return { x: spawn.position.x + dir.x * d, y: spawn.position.y, z: spawn.position.z + dir.z * d };
}
