import { describe, expect, it } from 'vitest';
import { keysToInput } from './keyboard';

const keys = (...codes: string[]) => new Set(codes);

describe('keysToInput', () => {
  it('ArrowUp walks away from a camera looking along +z', () => {
    const i = keysToInput(keys('ArrowUp'), 0);
    expect(i.moveX).toBeCloseTo(0);
    expect(i.moveZ).toBeCloseTo(1);
  });

  it('ArrowUp walks where the camera looks after a 90 degree turn', () => {
    const i = keysToInput(keys('ArrowUp'), Math.PI / 2);
    expect(i.moveX).toBeCloseTo(1);
    expect(i.moveZ).toBeCloseTo(0);
  });

  it('W and S match the up and down arrows', () => {
    for (const [wasd, arrow] of [['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']] as const) {
      expect(keysToInput(keys(wasd), 0.7)).toEqual(keysToInput(keys(arrow), 0.7));
    }
  });

  it('the left and right arrows do not move her: they turn the camera (mouse-look)', () => {
    for (const arrow of ['ArrowLeft', 'ArrowRight']) {
      const i = keysToInput(keys(arrow), 0.7);
      expect(Math.hypot(i.moveX, i.moveZ)).toBe(0);
    }
  });

  it('D steps right on screen: -x for a camera looking along +z', () => {
    const i = keysToInput(keys('KeyD'), 0);
    expect(i.moveX).toBeCloseTo(-1);
    expect(i.moveZ).toBeCloseTo(0);
  });

  it('opposite keys cancel', () => {
    const i = keysToInput(keys('ArrowUp', 'ArrowDown'), 0);
    expect(i.moveX).toBeCloseTo(0);
    expect(i.moveZ).toBeCloseTo(0);
  });

  it('maps Space to jump and either Shift to blink', () => {
    expect(keysToInput(keys('Space'), 0).jump).toBe(true);
    expect(keysToInput(keys('ShiftLeft'), 0).blink).toBe(true);
    expect(keysToInput(keys('ShiftRight'), 0).blink).toBe(true);
    const idle = keysToInput(keys(), 0);
    expect(idle.jump).toBe(false);
    expect(idle.blink).toBe(false);
  });
});

describe('keysToInput strike', () => {
  it('X or the left mouse button strikes; nothing else does', () => {
    expect(keysToInput(new Set(['KeyX']), 0).strike).toBe(true);
    expect(keysToInput(new Set(['Mouse0']), 0).strike).toBe(true);
    expect(keysToInput(new Set(['KeyW', 'Space', 'ShiftLeft']), 0).strike).toBe(false);
    expect(keysToInput(new Set(), 0).strike).toBe(false);
  });
});
