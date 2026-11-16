import { describe, expect, it } from 'vitest';
import { hitFxFor } from './hit-fx';

describe('hitFxFor', () => {
  it('a landed strike flashes and throws dust', () => {
    const fx = hitFxFor({ type: 'struck', enemyId: 'b1', hit: true });
    expect(fx.flash).toBe(true);
    expect(fx.burst).not.toBe('none');
  });

  it('a blocked strike clinks without particles', () => {
    const fx = hitFxFor({ type: 'struck', enemyId: 'b1', hit: false });
    expect(fx.sound).toBe('clink');
    expect(fx.burst).toBe('none');
  });

  it('a strike at nothing makes no clink', () => {
    expect(hitFxFor({ type: 'struck', enemyId: null, hit: false }).sound).not.toBe('clink');
  });

  it('a defeated enemy bursts into particles', () => {
    expect(hitFxFor({ type: 'enemyDefeated', id: 'b1' }).burst).not.toBe('none');
  });

  it('a lost heart flashes the frame; other events do nothing', () => {
    expect(hitFxFor({ type: 'heartLost', cause: 'hit' }).flash).toBe(true);
    expect(hitFxFor({ type: 'landed' })).toEqual({ burst: 'none', flash: false, sound: 'none' });
  });
});
