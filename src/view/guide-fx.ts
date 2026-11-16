import type { Progress } from '../sim/guide';
import type { Vec3 } from '../sim/level';
import type { Tuning } from '../sim/tuning';

export type BubblePicture = 'cage' | 'key' | 'flower' | 'heart';

/** Що показує Бульбашка Вцілілого: наступні кроки історії. */
export function bubbleFrames(progress: Progress): BubblePicture[] {
  if (progress === 'needKey') return ['cage', 'key', 'flower'];
  if (progress === 'haveKey') return ['key', 'cage'];
  return ['heart'];
}

/** Малюнок у мить `timeSeconds`: по колу, кожен `frameSeconds`. */
export function bubbleFrame<T>(frames: readonly T[], timeSeconds: number, frameSeconds: number): T {
  const i = Math.floor(timeSeconds / frameSeconds + 1e-9) % frames.length;
  return frames[i]!;
}

/** Бульбашку видно, коли Софійка ближче за `talkRadius` до Вцілілого (по xz). */
export function bubbleVisible(sofiyka: Vec3, survivor: Vec3, tuning: Tuning): boolean {
  return Math.hypot(sofiyka.x - survivor.x, sofiyka.z - survivor.z) < tuning.village.talkRadius;
}

/** Точки пилку вздовж ламаної: початок, далі через `spacing` м шляху, останньою — кінець. */
export function trailPoints(path: readonly Vec3[], spacing: number): Vec3[] {
  if (path.length === 0) return [];
  const out: Vec3[] = [{ ...path[0]! }];
  let carry = 0; // скільки шляху пройдено від останньої точки
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    let at = spacing - carry;
    while (at < len - 1e-9) {
      const k = at / len;
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
      at += spacing;
    }
    carry = len - (at - spacing);
  }
  const last = path[path.length - 1]!;
  const prev = out[out.length - 1]!;
  if (Math.hypot(last.x - prev.x, last.y - prev.y, last.z - prev.z) > 1e-9) out.push({ ...last });
  return out;
}
