import {
  BackSide,
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  type ColorRepresentation,
  type Side,
  type Object3D,
  type Texture,
} from 'three';

/** Скільки тонів світла в тонованому матеріалі. */
export const TOON_STEPS = 4;

let gradient: DataTexture | null = null;
/** Спільна «сходинкова» карта світла: 4 тони без плавного переходу (вигляд мальованої гри). */
function toonGradient(): DataTexture {
  if (!gradient) {
    const data = new Uint8Array([70, 140, 205, 255]);
    gradient = new DataTexture(data, TOON_STEPS, 1, RedFormat);
    gradient.minFilter = NearestFilter;
    gradient.magFilter = NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

export type ToonParams = {
  color?: ColorRepresentation;
  emissive?: ColorRepresentation;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: Side;
  map?: Texture | null;
  /** Ігнорується: у тонованого матеріалу немає PBR-властивостей (лишено, щоб не міняти виклики). */
  roughness?: number;
  metalness?: number;
  flatShading?: boolean;
};

/** Тонований матеріал зі сходинковим світлом; PBR-параметри відкидає. */
export function toonMaterial(params: ToonParams = {}): MeshToonMaterial {
  const { roughness: _r, metalness: _m, flatShading: _f, ...rest } = params;
  void _r;
  void _m;
  void _f;
  const material = new MeshToonMaterial(rest);
  material.gradientMap = toonGradient();
  return material;
}

const OUTLINE = new MeshBasicMaterial({ color: '#16121c', side: BackSide });
/** Наскільки оболонка контуру більша за деталь. */
const OUTLINE_SCALE = 1.06;

/**
 * Контур «перевернутою оболонкою»: до кожної сітки додається темна копія, трохи більша, видима лише зсередини.
 * Повертає додані оболонки.
 */
export function addOutline(root: Object3D): Mesh[] {
  const parts: Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof Mesh && !o.userData['outline'] && !o.userData['noOutline']) parts.push(o);
  });
  return parts.map((part) => {
    const shell = new Mesh(part.geometry, OUTLINE);
    shell.userData['outline'] = true;
    shell.scale.setScalar(OUTLINE_SCALE);
    shell.castShadow = false;
    shell.receiveShadow = false;
    part.add(shell);
    return shell;
  });
}
