export type BearSkin = {
  fur: string;
  light: string;
  dark: string;
  roughness: number;
  /** Світні очі; `null` — очі темні, як ніс. */
  eyes: { color: string; emissiveIntensity: number } | null;
  backpack: boolean;
  /** Колір шарфа на шиї; `null` — без шарфа. */
  scarf: string | null;
  /** Ліхтар у лівій лапі (світиться). */
  lantern: boolean;
};

/** Оригінальний бурий ведмідь із `small-bear-journey`. */
export const BROWN_SKIN: BearSkin = {
  fur: '#a5662f',
  light: '#e8c79e',
  dark: '#2b1a10',
  roughness: 0.8,
  eyes: null,
  backpack: true,
  scarf: null,
  lantern: false,
};

/**
 * Чорна Софійка зі світними червоними очима, без рюкзака. Хутро — темне вугільно-фіолетове, а не чисто чорне:
 * у тонованому світлі чорне зливається в пляму без форми; морда й живіт трохи світліші.
 */
export const SOFIYKA_SKIN: BearSkin = {
  fur: '#2b2836',
  light: '#4a4558',
  dark: '#0e0d14',
  roughness: 0.85,
  eyes: { color: '#ff0033', emissiveIntensity: 4.0 },
  backpack: false,
  scarf: null,
  lantern: false,
};

/** Вцілілий: бурий ведмідь із червоним шарфом і ліхтарем. */
export const SURVIVOR_SKIN: BearSkin = {
  fur: '#8a5a2b',
  light: '#e2c294',
  dark: '#2b1a10',
  roughness: 0.8,
  eyes: null,
  backpack: false,
  scarf: '#c8323c',
  lantern: true,
};

/** Полонений у Клітці: світло-сірий ведмідь. */
export const CAPTIVE_SKIN: BearSkin = {
  fur: '#9c9aa6',
  light: '#e6e4ec',
  dark: '#2a2830',
  roughness: 0.85,
  eyes: null,
  backpack: false,
  scarf: null,
  lantern: false,
};

/** Кольори рюкзака не залежать від шкури. */
export const BACKPACK_COLORS = { body: '#2f6fd6', trim: '#1d4fa3' } as const;
