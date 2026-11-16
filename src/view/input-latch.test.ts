import { describe, expect, it } from 'vitest';
import { createInputLatch } from './input-latch';

describe('createInputLatch', () => {
  it('keeps a tap that began and ended between two steps until consumed', () => {
    const latch = createInputLatch();
    latch.press('ShiftLeft');
    latch.release('ShiftLeft');
    expect(latch.snapshot().has('ShiftLeft')).toBe(true);
    latch.consumed();
    expect(latch.snapshot().has('ShiftLeft')).toBe(false);
  });

  it('a held key stays pressed across steps until released', () => {
    const latch = createInputLatch();
    latch.press('KeyW');
    latch.consumed();
    expect(latch.snapshot().has('KeyW')).toBe(true);
    latch.release('KeyW');
    expect(latch.snapshot().has('KeyW')).toBe(false);
  });

  it('clear drops everything', () => {
    const latch = createInputLatch();
    latch.press('KeyW');
    latch.press('ShiftLeft');
    latch.release('ShiftLeft');
    latch.clear();
    expect(latch.snapshot().size).toBe(0);
  });
});
