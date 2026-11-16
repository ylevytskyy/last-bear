import type { Input } from '../sim/input';

const held = (pressed: ReadonlySet<string>, ...codes: string[]) => codes.some((c) => pressed.has(c));

/**
 * Клавіші → `Input`. «Вгору» — від камери: камера з `cameraYaw` (0 = дивиться вздовж +z)
 * має вперед (sin, cos) і праворуч (-cos, sin) у площині xz.
 */
export function keysToInput(pressed: ReadonlySet<string>, cameraYaw: number): Input {
  const forward = (held(pressed, 'ArrowUp', 'KeyW') ? 1 : 0) - (held(pressed, 'ArrowDown', 'KeyS') ? 1 : 0);
  // Стрілки вліво/вправо крутять камеру (mouse-look), тож убік ходять лише A і D.
  const right = (held(pressed, 'KeyD') ? 1 : 0) - (held(pressed, 'KeyA') ? 1 : 0);
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  return {
    moveX: forward * sin - right * cos,
    moveZ: forward * cos + right * sin,
    jump: pressed.has('Space'),
    blink: held(pressed, 'ShiftLeft', 'ShiftRight'),
    strike: held(pressed, 'KeyX', 'Mouse0'),
  };
}
