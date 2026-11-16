import { describe, expect, it } from 'vitest';
import type { EnemyState } from './sim';
import { strikeHits } from './strike';
import { TUNING } from './tuning';

const HER = { position: { x: 0, y: 0, z: 0 }, facing: 0 }; // дивиться вздовж +z
const enemy = (kind: 'bee' | 'turtle', x: number, z: number, over: Partial<EnemyState> = {}): EnemyState => ({
  id: 'e',
  kind,
  position: { x, y: kind === 'bee' ? 0.5 : 0, z },
  facing: 0,
  state: kind === 'bee' ? 'STUCK' : 'WALK',
  stateTime: 0,
  attacking: false,
  vulnerable: kind === 'bee',
  hp: 1,
  ...over,
});

describe('strikeHits', () => {
  it('hits a stuck bee in front, misses one behind or far', () => {
    expect(strikeHits(HER, enemy('bee', 0, 1), TUNING)).toBe('hit');
    expect(strikeHits(HER, enemy('bee', 0, -1.5), TUNING)).toBe('miss');
    expect(strikeHits(HER, enemy('bee', 0, 4), TUNING)).toBe('miss');
  });

  it('a bee that is not stuck blocks', () => {
    expect(strikeHits(HER, enemy('bee', 0, 1, { state: 'HOVER', vulnerable: false, position: { x: 0, y: 1.5, z: 1 } }), TUNING)).toBe('blocked');
    expect(strikeHits(HER, enemy('bee', 0, 1, { state: 'DASH', vulnerable: false }), TUNING)).toBe('blocked');
  });

  it('a turtle blocks from the front and is hit on its flask side, within ±60°', () => {
    // Черепаха на z = 1.2 дивиться на неї (−z): Колба з боку +z — від неї.
    expect(strikeHits(HER, enemy('turtle', 0, 1.2, { facing: Math.PI }), TUNING)).toBe('blocked');
    // Черепаха дивиться від неї (+z): Колба до неї.
    expect(strikeHits(HER, enemy('turtle', 0, 1.2, { facing: 0 }), TUNING)).toBe('hit');
    const deg = Math.PI / 180;
    // Колба вказує на 55° і на 65° від напрямку на Софійку.
    expect(strikeHits(HER, enemy('turtle', 0, 1.2, { facing: 55 * deg }), TUNING)).toBe('hit');
    expect(strikeHits(HER, enemy('turtle', 0, 1.2, { facing: 65 * deg }), TUNING)).toBe('blocked');
  });
});
