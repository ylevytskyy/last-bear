import { toonMaterial } from '../toon';
import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshToonMaterial,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three';
import { BACKPACK_COLORS, type BearSkin } from './skins';
import { BEAR_PROPORTIONS, bearLayout, type BearLayout, type BearProportions } from './layout';

export type BearRig = {
  root: Group;
  torso: Group;
  headGroup: Group;
  leftArm: Group;
  rightArm: Group;
  leftLeg: Group;
  rightLeg: Group;
  tail: Mesh;
  /** Спільний матеріал очей, якщо шкура має світні очі. */
  eyeMaterial: MeshToonMaterial | null;
  /** Світне скло ліхтаря, якщо шкура його має. */
  lanternMaterial: MeshToonMaterial | null;
  materials: MeshToonMaterial[];
  proportions: BearProportions;
  layout: BearLayout;
};

/**
 * Builds the bear from primitives only. Scene graph:
 *
 * bearRoot (soles at y = 0, faces +z)
 * ├─ torso       body, belly patch, backpack
 * ├─ headGroup   origin at the neck: head, snout, nose, eyes, ears
 * ├─ leftArm / rightArm   origin at the shoulder joint
 * ├─ leftLeg / rightLeg   origin at the hip joint
 * └─ tail
 */
export function buildBear(skin: BearSkin, p: BearProportions = BEAR_PROPORTIONS): BearRig {
  const layout = bearLayout(p);

  const material = (color: string) => toonMaterial({ color, roughness: skin.roughness, flatShading: true });
  const fur = material(skin.fur);
  const light = material(skin.light);
  const dark = material(skin.dark);
  const pack = material(BACKPACK_COLORS.body);
  const packTrim = material(BACKPACK_COLORS.trim);
  const eyeMaterial = skin.eyes
    ? toonMaterial({
        color: skin.eyes.color,
        emissive: skin.eyes.color,
        emissiveIntensity: skin.eyes.emissiveIntensity,
        roughness: skin.roughness,
      })
    : null;

  const part = (name: string, geometry: BufferGeometry, mat: MeshToonMaterial) => {
    const mesh = new Mesh(geometry, mat);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  const group = (name: string) => {
    const g = new Group();
    g.name = name;
    return g;
  };

  // --- torso -------------------------------------------------------------
  const torso = group('torso');
  torso.position.y = layout.torsoCenterY;

  const body = part('body', new SphereGeometry(p.torsoRadius, 10, 8), fur);
  body.scale.set(1, p.torsoStretchY, p.torsoStretchZ);

  const bellyRadius = p.torsoRadius * 0.62;
  const belly = part('belly', new SphereGeometry(bellyRadius, 8, 6), light);
  belly.scale.set(1, 1.15, 0.4);
  belly.position.set(0, -layout.torsoHalfHeight * 0.1, layout.torsoHalfDepth * 0.78);

  torso.add(body, belly);
  if (skin.backpack) {
    const packDepth = p.torsoRadius * 0.55;
    const packHeight = layout.torsoHalfHeight * 1.1;
    const backpack = group('backpack');
    backpack.position.set(0, layout.torsoHalfHeight * 0.15, -(layout.torsoHalfDepth * 0.75 + packDepth / 2));
    const packBody = part('backpackBody', new BoxGeometry(p.torsoRadius * 1.25, packHeight, packDepth), pack);
    const packPocket = part(
      'backpackPocket',
      new BoxGeometry(p.torsoRadius * 0.8, packHeight * 0.4, packDepth * 0.3),
      packTrim,
    );
    packPocket.position.set(0, -packHeight * 0.2, -packDepth * 0.55);
    backpack.add(packBody, packPocket);
    torso.add(backpack);
  }

  // --- head --------------------------------------------------------------
  const headGroup = group('headGroup');
  headGroup.position.y = layout.neckY;
  const r = p.headRadius;
  const headY = layout.headCenterY;

  const head = part('head', new IcosahedronGeometry(r, 1), fur);
  head.scale.set(1.1, 0.95, 1);
  head.position.y = headY;

  const snoutRadius = r * 0.45;
  const snout = part('snout', new SphereGeometry(snoutRadius, 8, 6), light);
  snout.scale.set(1.15, 0.75, 0.9);
  snout.position.set(0, headY - r * 0.25, r * 0.8);

  const nose = part('nose', new SphereGeometry(snoutRadius * 0.28, 6, 5), dark);
  nose.position.set(0, snout.position.y + snoutRadius * 0.3, snout.position.z + snoutRadius * 0.8);

  headGroup.add(head, snout, nose);

  const earRadius = r * 0.32;
  for (const side of [1, -1]) {
    const eye = part(side > 0 ? 'leftEye' : 'rightEye', new SphereGeometry(r * 0.11, 6, 5), eyeMaterial ?? dark);
    eye.position.set(side * r * 0.42, headY + r * 0.15, r * 0.86);

    const ear = group(side > 0 ? 'leftEar' : 'rightEar');
    ear.position.set(side * r * 0.72, headY + r * 0.72, 0);
    const outer = part('earOuter', new SphereGeometry(earRadius, 8, 6), fur);
    outer.scale.z = 0.5;
    const inner = part('earInner', new SphereGeometry(earRadius * 0.6, 8, 6), light);
    inner.scale.z = 0.5;
    inner.position.z = earRadius * 0.3;
    ear.add(outer, inner);

    headGroup.add(eye, ear);
  }

  // --- limbs: the group origin is the joint, the mesh hangs below it -------
  const limb = (name: string, length: number, radius: number, x: number, y: number) => {
    const pivot = group(name);
    pivot.position.set(x, y, 0);
    const mesh = part(`${name}Mesh`, new CapsuleGeometry(radius, length - radius * 2, 3, 8), fur);
    mesh.position.y = -length / 2;
    pivot.add(mesh);
    return pivot;
  };

  const leftArm = limb('leftArm', p.armLength, p.armRadius, layout.shoulder.x, layout.shoulder.y);
  const rightArm = limb('rightArm', p.armLength, p.armRadius, -layout.shoulder.x, layout.shoulder.y);
  const leftLeg = limb('leftLeg', p.legLength, p.legRadius, layout.hip.x, layout.hip.y);
  const rightLeg = limb('rightLeg', p.legLength, p.legRadius, -layout.hip.x, layout.hip.y);

  // --- tail --------------------------------------------------------------
  const tail = part('tail', new IcosahedronGeometry(layout.tail.radius, 1), fur);
  tail.position.set(0, layout.tail.y, layout.tail.z);

  const root = group('bearRoot');
  root.add(torso, headGroup, leftArm, rightArm, leftLeg, rightLeg, tail);

  // --- accessories ---------------------------------------------------------
  const extra: MeshToonMaterial[] = [];
  if (skin.scarf) {
    const scarfMaterial = material(skin.scarf);
    extra.push(scarfMaterial);
    const scarf = part('scarf', new TorusGeometry(p.headRadius * 0.75, p.headRadius * 0.18, 6, 14), scarfMaterial);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = layout.neckY;
    const tailEnd = part('scarfEnd', new BoxGeometry(p.headRadius * 0.3, p.headRadius * 0.9, p.headRadius * 0.12), scarfMaterial);
    tailEnd.position.set(p.headRadius * 0.35, layout.neckY - p.headRadius * 0.45, p.headRadius * 0.7);
    tailEnd.rotation.z = 0.2;
    root.add(scarf, tailEnd);
  }
  let lanternMaterial: MeshToonMaterial | null = null;
  if (skin.lantern) {
    const frame = material('#3a3a44');
    lanternMaterial = toonMaterial({ color: '#ffd27a', emissive: '#ffb347', emissiveIntensity: 3, roughness: 0.3 });
    extra.push(frame, lanternMaterial);
    const lantern = group('lantern');
    lantern.position.set(0, -p.armLength - p.armRadius * 0.6, p.armRadius * 0.6);
    const glass = part('lanternGlass', new CylinderGeometry(p.armRadius * 0.9, p.armRadius * 0.9, p.armRadius * 2, 8), lanternMaterial);
    glass.castShadow = false;
    const cap = part('lanternCap', new CylinderGeometry(p.armRadius * 0.4, p.armRadius * 1.1, p.armRadius * 0.5, 8), frame);
    cap.position.y = p.armRadius * 1.2;
    lantern.add(glass, cap);
    leftArm.add(lantern);
  }


  return {
    root,
    torso,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    tail,
    eyeMaterial,
    lanternMaterial,
    materials: [fur, light, dark, ...(skin.backpack ? [pack, packTrim] : []), ...(eyeMaterial ? [eyeMaterial] : []), ...extra],
    proportions: p,
    layout,
  };
}

export function setBearWireframe(rig: BearRig, enabled: boolean): void {
  for (const material of rig.materials) material.wireframe = enabled;
}

/** Frees GPU resources. Call when the bear leaves the scene for good. */
export function disposeBear(rig: BearRig): void {
  rig.root.traverse((object) => {
    if (object instanceof Mesh) object.geometry.dispose();
  });
  for (const material of rig.materials) material.dispose();
}
