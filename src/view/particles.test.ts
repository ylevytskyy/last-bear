import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { createParticles } from './particles';

const at = { x: 1, y: 0, z: 2 };

describe('particles', () => {
  it('a burst makes particles that all die out', () => {
    const p = createParticles(new Scene());
    expect(p.activeCount()).toBe(0);
    p.burst(at);
    expect(p.activeCount()).toBeGreaterThan(0);
    p.update(5);
    expect(p.activeCount()).toBe(0);
    p.dispose();
  });

  it('a trail only appears while moving', () => {
    const p = createParticles(new Scene());
    p.trail(at, false);
    expect(p.activeCount()).toBe(0);
    p.trail(at, true);
    expect(p.activeCount()).toBeGreaterThan(0);
    p.dispose();
  });
});
