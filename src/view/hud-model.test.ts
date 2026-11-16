import { describe, expect, it } from 'vitest';
import { blinkVisible, heartsLayout, hurtFlash } from './hud-model';

describe('heartsLayout', () => {
  it('fills from the left and always has maxHearts entries', () => {
    expect(heartsLayout(3, 5)).toEqual(['full', 'full', 'full', 'empty', 'empty']);
    expect(heartsLayout(0, 5)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
    expect(heartsLayout(5, 5)).toEqual(['full', 'full', 'full', 'full', 'full']);
    expect(heartsLayout(7, 5)).toHaveLength(5);
    expect(heartsLayout(-1, 5)).toHaveLength(5);
  });
});

describe('blinkVisible', () => {
  it('is always visible when not invulnerable', () => {
    for (let t = 0; t < 1; t += 1 / 60) expect(blinkVisible(0, t)).toBe(true);
  });

  it('flickers at about 8 Hz while invulnerable', () => {
    const seen: boolean[] = [];
    for (let i = 0; i < 60; i++) seen.push(blinkVisible(0.5, i / 60));
    expect(seen).toContain(true);
    expect(seen).toContain(false);
    const changes = seen.filter((v, i) => i > 0 && v !== seen[i - 1]).length;
    expect(changes).toBeGreaterThanOrEqual(12); // ≈ 8 Гц: 16 перемикань за секунду
    expect(changes).toBeLessThanOrEqual(20);
  });
});

describe('hurtFlash', () => {
  it('starts at 1, is gone by 0.3 s and never grows', () => {
    expect(hurtFlash(0)).toBe(1);
    expect(hurtFlash(0.3)).toBe(0);
    expect(hurtFlash(5)).toBe(0);
    let prev = Infinity;
    for (let t = 0; t <= 0.4; t += 0.01) {
      expect(hurtFlash(t)).toBeLessThanOrEqual(prev);
      prev = hurtFlash(t);
    }
  });
});
