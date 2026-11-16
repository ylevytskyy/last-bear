import { Mesh, MeshToonMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { buildBear } from './bear/build-bear';
import { SOFIYKA_SKIN } from './bear/skins';
import { addOutline, toonMaterial, TOON_STEPS } from './toon';

describe('toon look', () => {
  it('makes a banded toon material that keeps colour and glow', () => {
    const m = toonMaterial({ color: '#ff8800', emissive: '#220000', emissiveIntensity: 2, roughness: 0.4, flatShading: true });
    expect(m).toBeInstanceOf(MeshToonMaterial);
    expect(m.color.getHexString()).toBe('ff8800');
    expect(m.emissiveIntensity).toBe(2);
    expect(m.gradientMap).not.toBeNull();
    expect((m.gradientMap!.image as { width: number }).width).toBe(TOON_STEPS);
  });

  it('every bear part is toon-shaded', () => {
    const rig = buildBear(SOFIYKA_SKIN);
    expect(rig.materials.every((m) => (m as unknown) instanceof MeshToonMaterial)).toBe(true);
  });

  it('an outline is a dark back-face shell on every mesh of the object, a little larger', () => {
    const rig = buildBear(SOFIYKA_SKIN);
    let parts = 0;
    rig.root.traverse((o) => (o instanceof Mesh && !o.userData['outline'] ? parts++ : undefined));
    const shells = addOutline(rig.root);
    expect(shells).toHaveLength(parts);
    for (const s of shells) {
      expect(s.userData['outline']).toBe(true);
      expect(s.scale.x).toBeGreaterThan(1);
    }
  });
});
