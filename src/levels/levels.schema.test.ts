import { describe, expect, it } from 'vitest';
import arena from './arena.level.json';
import backrooms from './backrooms.level.json';
import honeycombs from './honeycombs.level.json';
import playground from './playground.level.json';
import village from './village.level.json';

/**
 * Рівні приходять із Blender як JSON і приводяться до `Level` без перевірки типів (`as Level`).
 * Цей тест — та перевірка: зайвий чи перейменований ключ або невідоме значення зупиняє набір тестів.
 */
type Problems = string[];
type Check = (value: unknown, path: string, out: Problems) => void;

const number: Check = (v, p, out) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) out.push(`${p}: not a number`);
};
const boolean: Check = (v, p, out) => {
  if (typeof v !== 'boolean') out.push(`${p}: not a boolean`);
};
const text: Check = (v, p, out) => {
  if (typeof v !== 'string' || v === '') out.push(`${p}: not a non-empty string`);
};
const oneOf =
  (...allowed: string[]): Check =>
  (v, p, out) => {
    if (typeof v !== 'string' || !allowed.includes(v)) out.push(`${p}: ${JSON.stringify(v)} is not one of ${allowed.join(', ')}`);
  };
const list =
  (item: Check): Check =>
  (v, p, out) => {
    if (!Array.isArray(v)) out.push(`${p}: not a list`);
    else v.forEach((x, i) => item(x, `${p}[${i}]`, out));
  };
/** Об'єкт рівно з цими ключами; ключі з `optional` можна пропустити. */
const shape =
  (fields: Record<string, Check>, optional: string[] = []): Check =>
  (v, p, out) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      out.push(`${p}: not an object`);
      return;
    }
    const record = v as Record<string, unknown>;
    for (const key of Object.keys(record)) if (!(key in fields)) out.push(`${p}.${key}: unknown key`);
    for (const [key, check] of Object.entries(fields)) {
      if (key in record) check(record[key], `${p}.${key}`, out);
      else if (!optional.includes(key)) out.push(`${p}.${key}: missing`);
    }
  };
const either =
  (a: Check, b: Check): Check =>
  (v, p, out) => {
    const first: Problems = [];
    a(v, p, first);
    if (first.length > 0) b(v, p, out);
  };

const WORLDS = ['backrooms', 'village', 'honeycombs'];
const vec3 = shape({ x: number, y: number, z: number });
const block = shape({ kind: oneOf('solid', 'bars'), center: vec3, halfExtents: vec3, look: oneOf('ground', 'house', 'stem', 'source') }, ['look']);
const level = shape(
  {
    blocks: list(block),
    spawn: vec3,
    killY: number,
    enemies: list(shape({ id: text, kind: oneOf('bee', 'turtle'), position: vec3, facing: number })),
    cages: list(shape({ id: text, position: vec3, facing: number, working: boolean })),
    flowers: list(
      shape(
        { id: text, position: vec3, color: oneOf('yellow', 'pink', 'blue'), opens: boolean, opensWhen: oneOf('near', 'keyHeld'), to: oneOf(...WORLDS) },
        ['opensWhen', 'to'],
      ),
    ),
    movers: list(shape({ id: text, block, to: vec3 })),
    source: shape({ id: text, position: vec3 }),
    entries: shape({ backrooms: vec3, village: vec3, honeycombs: vec3 }, WORLDS),
    signs: list(shape({ position: vec3, facing: number, keys: list(oneOf('arrows', 'space', 'space2', 'shift', 'strike')) })),
    route: shape({
      points: list(vec3),
      actions: list(
        shape({
          at: number,
          do: either(oneOf('jump', 'doubleJump', 'blink', 'strikeSource'), shape({ waitMover: text, near: oneOf('A', 'B') })),
        }),
      ),
    }),
    intro: boolean,
    survivor: shape({ position: vec3, facing: number }),
    trail: shape({ flower: list(vec3), cage: list(vec3) }),
  },
  ['enemies', 'cages', 'flowers', 'movers', 'source', 'entries', 'signs', 'route', 'intro', 'survivor', 'trail'],
);

function problems(data: unknown): Problems {
  const out: Problems = [];
  level(data, 'level', out);
  const l = data as { blocks?: { halfExtents?: { x: number; y: number; z: number } }[]; movers?: { id: string }[]; route?: { points: unknown[]; actions: { at: number; do: unknown }[] }; source?: unknown };
  (l.blocks ?? []).forEach((b, i) => {
    if (b.halfExtents && Math.min(b.halfExtents.x, b.halfExtents.y, b.halfExtents.z) <= 0) out.push(`level.blocks[${i}]: zero thickness`);
  });
  const movers = new Set((l.movers ?? []).map((m) => m.id));
  for (const [i, a] of (l.route?.actions ?? []).entries()) {
    if (!Number.isInteger(a.at) || a.at < 0 || a.at >= (l.route?.points.length ?? 0)) out.push(`level.route.actions[${i}].at: no such point`);
    if (a.do === 'strikeSource' && !l.source) out.push(`level.route.actions[${i}]: strikeSource without a source`);
    const wait = (a.do as { waitMover?: string } | null)?.waitMover;
    if (typeof wait === 'string' && !movers.has(wait)) out.push(`level.route.actions[${i}]: no mover "${wait}"`);
  }
  return out;
}

describe('level files exported from Blender have the shape of Level', () => {
  for (const [name, data] of Object.entries({ arena, backrooms, honeycombs, playground, village })) {
    it(`${name}: every key is known, every value is of its kind, route actions point at real points and movers`, () => {
      expect(problems(data)).toEqual([]);
    });
  }

  it('the check itself catches a misspelt key, an unknown world, a missing field and a route action with no point', () => {
    const broken = {
      ...backrooms,
      spwan: backrooms.spawn,
      flowers: [{ ...backrooms.flowers[0], to: 'honeycomb' }],
      blocks: [{ kind: 'solid', center: { x: 0, y: 0, z: 0 } }],
      route: { points: backrooms.route.points, actions: [{ at: 99, do: 'jump' }] },
    };
    expect(problems(broken)).toEqual([
      'level.spwan: unknown key',
      'level.blocks[0].halfExtents: missing',
      'level.flowers[0].to: "honeycomb" is not one of backrooms, village, honeycombs',
      'level.route.actions[0].at: no such point',
    ]);
  });
});
