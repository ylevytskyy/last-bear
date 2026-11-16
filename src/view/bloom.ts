import {
  Layers,
  MeshBasicMaterial,
  ShaderMaterial,
  Vector2,
  type Camera,
  type Material,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const BLOOM_LAYER = 1;

const MIX_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const MIX_FRAGMENT = `
uniform sampler2D baseTexture;
uniform sampler2D bloomTexture;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(baseTexture, vUv) + vec4(1.0) * texture2D(bloomTexture, vUv);
}`;

const ABERRATION_FRAGMENT = `
uniform sampler2D tDiffuse;
uniform float strength;
varying vec2 vUv;
void main() {
  vec2 offset = vUv - 0.5;
  vec2 shift = offset * strength * 0.08 * dot(offset, offset);
  float r = texture2D(tDiffuse, vUv + shift).r;
  vec4 mid = texture2D(tDiffuse, vUv);
  float b = texture2D(tDiffuse, vUv - shift).b;
  gl_FragColor = vec4(r, mid.g, b, mid.a);
}`;

const GRADE_FRAGMENT = `
uniform sampler2D tDiffuse;
uniform float tint;
uniform float vignette;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  vec3 cold = c.rgb * vec3(0.7, 0.88, 1.2) + vec3(0.0, 0.02, 0.07);
  vec3 graded = mix(c.rgb, cold, tint);
  float d = length(vUv - 0.5) * 1.4142;
  graded *= 1.0 - vignette * smoothstep(0.45, 1.0, d);
  gl_FragColor = vec4(graded, c.a);
}`;

export type Bloom = {
  /** Тон Вікна: холодна картинка (0..1) і темні краї (0..1). */
  setGrade(tint: number, vignette: number): void;
  /** Сила розшарування кольорів по краях кадру, 0..1; в центрі кадру розшарування немає. */
  setAberration(strength: number): void;
  render(): void;
  setSize(width: number, height: number): void;
  /** Позначає об'єкт (і його нащадків) світним. */
  mark(object: Object3D): void;
  dispose(): void;
};

/**
 * Вибіркове світіння, як у прикладі Three.js `webgl_postprocessing_unreal_bloom_selective`:
 * перший компонувальник малює лише позначені об'єкти (решта чорні) і розмиває їх,
 * другий малює сцену і додає до неї результат першого.
 */
export function createBloom(renderer: WebGLRenderer, scene: Scene, camera: Camera): Bloom {
  const bloomLayer = new Layers();
  bloomLayer.set(BLOOM_LAYER);
  const darkMaterial = new MeshBasicMaterial({ color: 'black', fog: false });
  const stored = new Map<Object3D, Material | Material[]>();

  const size = renderer.getSize(new Vector2());

  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(size, 1.4, 0.6, 0);
  bloomComposer.addPass(bloomPass);

  const mixPass = new ShaderPass(
    new ShaderMaterial({
      uniforms: { baseTexture: { value: null }, bloomTexture: { value: bloomComposer.renderTarget2.texture } },
      vertexShader: MIX_VERTEX,
      fragmentShader: MIX_FRAGMENT,
    }),
    'baseTexture',
  );
  mixPass.needsSwap = true;
  const finalComposer = new EffectComposer(renderer);
  finalComposer.addPass(new RenderPass(scene, camera));
  finalComposer.addPass(mixPass);
  const aberrationPass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, strength: { value: 0 } },
    vertexShader: MIX_VERTEX,
    fragmentShader: ABERRATION_FRAGMENT,
  });
  aberrationPass.enabled = false;
  finalComposer.addPass(aberrationPass);
  const gradePass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, tint: { value: 0 }, vignette: { value: 0 } },
    vertexShader: MIX_VERTEX,
    fragmentShader: GRADE_FRAGMENT,
  });
  gradePass.enabled = false;
  finalComposer.addPass(gradePass);
  finalComposer.addPass(new OutputPass());

  const hidden: Object3D[] = [];
  const darken = (object: Object3D): void => {
    const target = object as Object3D & { material?: Material | Material[]; isLine?: boolean };
    if (bloomLayer.test(object.layers) || !target.material) return;
    const materials = Array.isArray(target.material) ? target.material : [target.material];
    // Прозорі об'єкти (ґрати) й лінії не повинні закривати ореол чорним: у цьому проході їх немає.
    if (target.isLine || materials.some((m) => m.transparent)) {
      if (object.visible) {
        object.visible = false;
        hidden.push(object);
      }
      return;
    }
    stored.set(object, target.material);
    target.material = darkMaterial;
  };
  const restore = (object: Object3D): void => {
    const original = stored.get(object);
    if (original) (object as Object3D & { material: Material | Material[] }).material = original;
  };

  return {
    setGrade(tint, vignette) {
      gradePass.enabled = tint > 0 || vignette > 0;
      gradePass.uniforms['tint']!.value = tint;
      gradePass.uniforms['vignette']!.value = vignette;
    },
    setAberration(strength) {
      aberrationPass.enabled = strength > 0;
      aberrationPass.uniforms['strength']!.value = strength;
    },
    render() {
      const { background, fog } = scene;
      scene.background = null;
      scene.fog = null;
      scene.traverse(darken);
      bloomComposer.render();
      scene.traverse(restore);
      stored.clear();
      for (const o of hidden) o.visible = true;
      hidden.length = 0;
      scene.background = background;
      scene.fog = fog;
      finalComposer.render();
    },
    setSize(width, height) {
      bloomComposer.setSize(width, height);
      finalComposer.setSize(width, height);
    },
    mark(object) {
      object.traverse((o) => o.layers.enable(BLOOM_LAYER));
    },
    dispose() {
      bloomComposer.dispose();
      finalComposer.dispose();
      darkMaterial.dispose();
    },
  };
}
