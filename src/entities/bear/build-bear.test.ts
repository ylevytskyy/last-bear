import { Box3, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { animateBear } from './animate';
import { buildBear, setBearWireframe } from './build-bear';
import { BROWN_SKIN, SOFIYKA_SKIN, SURVIVOR_SKIN } from './skins';

describe('buildBear', () => {
  const rig = buildBear(BROWN_SKIN);

  it('builds a named scene graph under bearRoot', () => {
    expect(rig.root.name).toBe('bearRoot');
    const names = rig.root.children.map((child) => child.name);
    expect(names).toEqual(
      expect.arrayContaining(['torso', 'headGroup', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'tail']),
    );
  });

  it('stands with its soles on y = 0', () => {
    const box = new Box3().setFromObject(rig.root);
    expect(box.min.y).toBeCloseTo(0, 3);
  });

  it('pivots arms at the shoulders and legs at the hips', () => {
    const { shoulder, hip } = rig.layout;
    expect(rig.leftArm.position.toArray()).toEqual([shoulder.x, shoulder.y, 0]);
    expect(rig.rightArm.position.toArray()).toEqual([-shoulder.x, shoulder.y, 0]);
    expect(rig.leftLeg.position.toArray()).toEqual([hip.x, hip.y, 0]);
    expect(rig.rightLeg.position.toArray()).toEqual([-hip.x, hip.y, 0]);
  });

  it('hangs limb meshes below their pivots', () => {
    for (const limb of [rig.leftArm, rig.rightArm, rig.leftLeg, rig.rightLeg]) {
      expect(limb.children[0]!.position.y).toBeLessThan(0);
    }
  });

  it('makes every mesh cast a shadow', () => {
    rig.root.traverse((object) => {
      if (object instanceof Mesh) expect(object.castShadow).toBe(true);
    });
  });

  it('uses banded toon fur (no glossy highlights)', () => {
    expect(rig.materials.length).toBeGreaterThan(0);
    for (const material of rig.materials) expect(material.gradientMap).not.toBeNull();
  });
});

describe('setBearWireframe', () => {
  it('switches every material', () => {
    const rig = buildBear(BROWN_SKIN);
    setBearWireframe(rig, true);
    expect(rig.materials.every((m) => m.wireframe)).toBe(true);
    setBearWireframe(rig, false);
    expect(rig.materials.some((m) => m.wireframe)).toBe(false);
  });
});

describe('animateBear', () => {
  it('rests at time zero', () => {
    const rig = buildBear(BROWN_SKIN);
    animateBear(rig, 0);
    expect(rig.leftLeg.rotation.x).toBeCloseTo(0);
    expect(rig.torso.scale.y).toBeCloseTo(1);
    expect(rig.headGroup.position.y).toBeCloseTo(rig.layout.neckY);
  });

  it('breathes: the torso stretches and the head rides up with it', () => {
    const rig = buildBear(BROWN_SKIN);
    animateBear(rig, 0.4);
    expect(rig.torso.scale.y).toBeGreaterThan(1);
    expect(rig.headGroup.position.y).toBeGreaterThan(rig.layout.neckY);
  });

  it('swings opposite limbs when walking', () => {
    const rig = buildBear(BROWN_SKIN);
    animateBear(rig, 0, 1, Math.PI / 2);
    expect(rig.leftLeg.rotation.x).not.toBeCloseTo(0);
    expect(rig.rightLeg.rotation.x).toBeCloseTo(-rig.leftLeg.rotation.x);
    expect(Math.sign(rig.leftArm.rotation.x)).toBe(-Math.sign(rig.leftLeg.rotation.x));
  });
});

describe('buildBear accessories', () => {
  it('the survivor wears a scarf and holds a glowing lantern', () => {
    const rig = buildBear(SURVIVOR_SKIN);
    const scarf = rig.root.getObjectByName('scarf');
    const lantern = rig.root.getObjectByName('lantern');
    expect(scarf).toBeDefined();
    expect(lantern).toBeDefined();
    expect(rig.lanternMaterial).not.toBeNull();
    expect(rig.materials).toContain(rig.lanternMaterial);
    const scarfMesh = scarf as Mesh;
    expect(rig.materials).toContain(scarfMesh.material);
    // Ліхтар у лівій лапі: рухається разом із нею.
    let parent = lantern!.parent;
    while (parent && parent !== rig.leftArm) parent = parent.parent;
    expect(parent).toBe(rig.leftArm);
  });

  it('Sofiyka has neither', () => {
    const rig = buildBear(SOFIYKA_SKIN);
    expect(rig.root.getObjectByName('scarf')).toBeUndefined();
    expect(rig.root.getObjectByName('lantern')).toBeUndefined();
    expect(rig.lanternMaterial).toBeNull();
  });
});

describe('animateBear keeps the bear where the game put it', () => {
  it('does not overwrite the root height, so a jumping bear is drawn in the air', () => {
    const rig = buildBear(BROWN_SKIN);
    rig.root.position.set(1, 1.6, 2); // у повітрі на вершині стрибка
    animateBear(rig, 0.4, 0, 0);
    expect(rig.root.position.y).toBe(1.6);
    animateBear(rig, 0.4, 1, Math.PI / 2); // крок ходьби з підскоком
    expect(rig.root.position.y).toBe(1.6);
    expect(rig.root.position.x).toBe(1);
  });
});
