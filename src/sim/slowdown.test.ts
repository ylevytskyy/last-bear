import { describe, expect, it } from 'vitest';
import type { EnemyState } from './sim';
import { createSlowdownBook, stepSlowdown, type SlowdownBook } from './slowdown';
import { TUNING } from './tuning';

const DT = TUNING.step;
const HER = { x: 0, y: 0, z: 0 };
const enemy = (attacking: boolean, x: number, z: number, y = 1.5): EnemyState => ({
  id: 'b1',
  kind: 'bee',
  position: { x, y, z },
  facing: 0,
  state: attacking ? 'WINDUP' : 'HOVER',
  stateTime: 0,
  attacking,
  vulnerable: false,
  hp: 1,
});
const step = (book: SlowdownBook, e: EnemyState[], canOpen = true) => stepSlowdown(book, e, HER, DT, canOpen, TUNING);

describe('Window (slowdown)', () => {
  it('opens when an attacking enemy is inside the sensor, for 1.2 real seconds', () => {
    const r = step(createSlowdownBook(), [enemy(true, 0, 3)]);
    expect(r.opened).toBe('b1');
    expect(r.book.slowdown).toEqual({ open: true, remaining: TUNING.slowdownSeconds, enemyId: 'b1' });
  });

  it('does not open for an enemy that is only near, or attacking outside the sensor, or too high', () => {
    expect(step(createSlowdownBook(), [enemy(false, 0, 1)]).opened).toBeNull();
    expect(step(createSlowdownBook(), [enemy(true, 0, 3.6)]).opened).toBeNull();
    expect(step(createSlowdownBook(), [enemy(true, 0, 1, 2.6)]).opened).toBeNull();
  });

  it('does not open while she is invulnerable', () => {
    expect(step(createSlowdownBook(), [enemy(true, 0, 1)], false).opened).toBeNull();
  });

  it('counts real seconds: 1/12 s per rules step at time scale 0.2, closing on the 15th step', () => {
    let { book } = step(createSlowdownBook(), [enemy(true, 0, 3)]);
    let closedAt = -1;
    for (let i = 1; i <= 20 && closedAt < 0; i++) {
      const before = book.slowdown.remaining;
      const r = step(book, [enemy(true, 0, 3)]);
      if (r.expired) closedAt = i;
      else expect(before - r.book.slowdown.remaining).toBeCloseTo(DT / TUNING.slowdownTimeScale, 9);
      book = r.book;
    }
    expect(closedAt).toBe(15);
    expect(book.slowdown).toEqual({ open: false, remaining: 0, enemyId: null });
  });

  it('one Window per attack: the same attack never reopens it, the next attack does', () => {
    let { book } = step(createSlowdownBook(), [enemy(true, 0, 3)]);
    for (let i = 0; i < 20; i++) book = step(book, [enemy(true, 0, 3)]).book;
    expect(book.slowdown.open).toBe(false);
    for (let i = 0; i < 20; i++) expect(((book = step(book, [enemy(true, 0, 2)]).book), book.slowdown.open)).toBe(false);
    book = step(book, [enemy(false, 0, 2)]).book; // атака скінчилась
    const r = step(book, [enemy(true, 0, 2)]); // нова атака
    expect(r.opened).toBe('b1');
  });
});
