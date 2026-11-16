export type Vec3 = { x: number; y: number; z: number };
/** Світи Зрізу. */
export type WorldId = 'backrooms' | 'village' | 'honeycombs';
/** Як показ малює блок; за замовчуванням `ground`. */
export type BlockLook = 'ground' | 'house' | 'stem' | 'source';
export type Block = { kind: 'solid' | 'bars'; center: Vec3; halfExtents: Vec3; look?: BlockLook };
/** `position`: Бджола — центр тіла; Черепаха — підошви. `facing` — рад, 0 = +z. */
export type EnemySpawn = { id: string; kind: 'bee' | 'turtle'; position: Vec3; facing: number };
/** `position` — центр підлоги Клітки; `facing` — куди дивляться двері (кратно чверті оберту). */
export type CageSpawn = { id: string; position: Vec3; facing: number; working: boolean };
/** `position` — земля під центром ніжки. */
/**
 * `opensWhen`: `'near'` (за замовчуванням) — розкривається, коли Софійка поруч; `'keyHeld'` — лише коли вона ще й тримає Ключ.
 * `to` — світ, у який веде Квітка; без `to` стрибок у бутон повертає на Контрольну точку.
 */
export type FlowerSpawn = {
  id: string;
  position: Vec3;
  color: 'yellow' | 'pink' | 'blue';
  opens: boolean;
  opensWhen?: 'near' | 'keyHeld';
  to?: WorldId;
};
/** Рухома платформа: `block.center` — точка A, `to` — точка B (центр блока); ходить A↔B з `tuning.movers.speed`. */
export type MoverSpawn = { id: string; block: Block; to: Vec3 };
/** Табличка з малюнками клавіш біля перешкоди (лише показ): `position` — земля, `facing` — куди вона дивиться. */
export type SignSpawn = { position: Vec3; facing: number; keys: ('arrows' | 'space' | 'space2' | 'shift' | 'strike')[] };
export type RouteAction = 'jump' | 'doubleJump' | 'blink' | 'strikeSource' | { waitMover: string; near: 'A' | 'B' };
/** Маршрут рівня: ламана по xz і дії, що виконуються, коли бот дійшов до `points[at]`. */
export type Route = { points: Vec3[]; actions: { at: number; do: RouteAction }[] };
/** Джерело: `position` — земля під центром казана. */
export type SourceSpawn = { id: string; position: Vec3 };
export type Level = {
  blocks: Block[];
  spawn: Vec3;
  killY: number;
  enemies?: EnemySpawn[];
  cages?: CageSpawn[];
  flowers?: FlowerSpawn[];
  movers?: MoverSpawn[];
  source?: SourceSpawn;
  /** Де Софійка з'являється в цьому світі, коли прийшла з іншого (без запису — на `spawn`). */
  entries?: Partial<Record<WorldId, Vec3>>;
  signs?: SignSpawn[];
  route?: Route;
  /** Перші `worlds.introSeconds` правила не приймають руху (перетворення дівчинки на Софійку). */
  intro?: boolean;
  survivor?: { position: Vec3; facing: number };
  /** Ламані по землі від Вцілілого до жовтої Квітки і до точки перед дверима справжньої Клітки. */
  trail?: { flower: Vec3[]; cage: Vec3[] };
};
