import { describe, expect, it } from 'vitest';
import { VILLAGE } from '../levels/village';
import { progressOf, trailPath } from './guide';
import type { CageState } from './sim';

const cages = (open: { real?: boolean; decorative?: boolean }): CageState[] => [
  { id: 'a', open: open.decorative ?? false, working: false },
  { id: 'b', open: open.real ?? false, working: true },
  { id: 'c', open: false, working: false },
];
const trail = VILLAGE.trail!;

describe('progressOf', () => {
  it('needs a key with none in hand and no cage open', () => {
    expect(progressOf(0, cages({}))).toBe('needKey');
  });

  it('has the key with one or more in hand and the real cage shut', () => {
    expect(progressOf(1, cages({}))).toBe('haveKey');
    expect(progressOf(3, cages({}))).toBe('haveKey');
  });

  it('is freed once the real cage is open, with or without a key left', () => {
    expect(progressOf(0, cages({ real: true }))).toBe('freed');
    expect(progressOf(1, cages({ real: true }))).toBe('freed');
  });

  it('does not count an open decorative cage as freeing anyone', () => {
    expect(progressOf(0, cages({ decorative: true }))).toBe('needKey');
    expect(progressOf(1, cages({ decorative: true }))).toBe('haveKey');
  });

  it('with no cages at all it just follows the keys', () => {
    expect(progressOf(0, [])).toBe('needKey');
    expect(progressOf(1, [])).toBe('haveKey');
  });
});

describe('trailPath', () => {
  it('leads to the yellow flower while a key is needed', () => {
    expect(trailPath('needKey', trail)).toEqual(trail.flower);
  });

  it('leads to the real cage once she has the key', () => {
    expect(trailPath('haveKey', trail)).toEqual(trail.cage);
  });

  it('is empty once the captive is free', () => {
    expect(trailPath('freed', trail)).toEqual([]);
  });

  it('follows the rules from the sim state: keys 0 is the flower trail, keys 1 the cage trail, an open real cage nothing', () => {
    expect(trailPath(progressOf(0, cages({})), trail)).toEqual(trail.flower);
    expect(trailPath(progressOf(1, cages({})), trail)).toEqual(trail.cage);
    expect(trailPath(progressOf(1, cages({ real: true })), trail)).toEqual([]);
  });
});
