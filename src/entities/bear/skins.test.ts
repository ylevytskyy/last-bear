import { Mesh, MeshStandardMaterial, MeshToonMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { buildBear } from './build-bear';
import { BROWN_SKIN, CAPTIVE_SKIN, SOFIYKA_SKIN, SURVIVOR_SKIN } from './skins';

const meshNamed = (root: { getObjectByName(n: string): unknown }, name: string): Mesh => {
  const m = root.getObjectByName(name);
  if (!(m instanceof Mesh)) throw new Error(`no mesh ${name}`);
  return m;
};

describe('Sofiyka skin', () => {
  const rig = buildBear(SOFIYKA_SKIN);

  it('gives both eyes one glowing red material, exposed as eyeMaterial', () => {
    const left = meshNamed(rig.root, 'leftEye').material as MeshStandardMaterial;
    const right = meshNamed(rig.root, 'rightEye').material as MeshStandardMaterial;
    expect(left).toBe(right);
    expect(left.emissive.getHexString()).toBe('ff0033');
    expect(left.emissiveIntensity).toBe(4);
    expect(rig.eyeMaterial).toBe(left);
  });

  it('has no backpack and a black matte body', () => {
    const backpackNodes: string[] = [];
    rig.root.traverse((o) => {
      if (o.name.toLowerCase().includes('backpack')) backpackNodes.push(o.name);
    });
    expect(backpackNodes).toEqual([]);
    const body = meshNamed(rig.root, 'body').material as MeshToonMaterial;
    expect(body.color.getHexString()).toBe('2b2836'); // темна, але з формою в тонованому світлі
    expect(body.gradientMap).not.toBeNull(); // тонований, без глянцю
  });

  it('frees the eye material together with the rest on dispose', () => {
    expect(rig.materials).toContain(rig.eyeMaterial);
  });
});

describe('brown skin', () => {
  it('keeps the original look: backpack, dark non-glowing eyes, no eye material', () => {
    const rig = buildBear(BROWN_SKIN);
    expect(rig.root.getObjectByName('backpack')).toBeDefined();
    expect(rig.eyeMaterial).toBeNull();
    const eye = meshNamed(rig.root, 'leftEye').material as MeshStandardMaterial;
    expect(eye.emissiveIntensity).toBe(1);
    expect(eye.emissive.getHexString()).toBe('000000');
  });
});

describe('village bears', () => {
  it('the captive looks unlike Sofiyka and the survivor, with dark eyes', () => {
    expect(CAPTIVE_SKIN.fur).not.toBe(SOFIYKA_SKIN.fur);
    expect(CAPTIVE_SKIN.fur).not.toBe(SURVIVOR_SKIN.fur);
    expect(CAPTIVE_SKIN.eyes).toBeNull();
    expect(CAPTIVE_SKIN.scarf).toBeNull();
    expect(CAPTIVE_SKIN.lantern).toBe(false);
  });

  it('the survivor is brown with a scarf and a lantern', () => {
    expect(SURVIVOR_SKIN.scarf).not.toBeNull();
    expect(SURVIVOR_SKIN.lantern).toBe(true);
    expect(SOFIYKA_SKIN.scarf).toBeNull();
    expect(SOFIYKA_SKIN.lantern).toBe(false);
  });
});
