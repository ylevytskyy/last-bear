import { describe, expect, it } from 'vitest';
import { buildKey, buildSource, sourceLook } from './source-model';

describe('sourceLook', () => {
  it('shows one crack per strike and a dimmer brew as it breaks', () => {
    expect(sourceLook(3, 3).cracks).toBe(0);
    expect(sourceLook(1, 3).cracks).toBe(2);
    expect(sourceLook(1, 3).brew).toBeLessThan(sourceLook(3, 3).brew);
    expect(sourceLook(0, 3).cracks).toBe(3);
  });
});

describe('source and key models', () => {
  it('the cauldron has three hidden cracks and a glowing brew; the key glows', () => {
    const source = buildSource();
    expect(source.cracks).toHaveLength(3);
    expect(source.cracks.every((c) => !c.visible)).toBe(true);
    source.apply(sourceLook(1, 3));
    expect(source.cracks.filter((c) => c.visible)).toHaveLength(2);
    expect(source.brewMaterial.emissiveIntensity).toBeGreaterThan(0);
    source.dispose();
    const key = buildKey();
    expect(key.material.emissiveIntensity).toBeGreaterThan(0);
    key.dispose();
  });
});
