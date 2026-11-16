import { describe, expect, it } from 'vitest';
import { HONEYCOMBS } from '../levels/honeycombs';
import { keyDropAt } from './source';
import { TUNING } from './tuning';

describe('the key falls where the child can see it', () => {
  it('lands out of reach of the spot she strikes the Source from, so she has to walk to it', () => {
    const route = HONEYCOMBS.route!;
    const strike = route.actions.find((a) => a.do === 'strikeSource')!;
    const stand = route.points[strike.at]!;
    const key = keyDropAt(HONEYCOMBS.source!, stand, TUNING);
    const gap = Math.hypot(key.x - stand.x, key.z - stand.z);
    expect(gap).toBeGreaterThanOrEqual(TUNING.source.pickupRadius + 0.2);
    // І не всередині казана.
    expect(Math.hypot(key.x - HONEYCOMBS.source!.position.x, key.z - HONEYCOMBS.source!.position.z)).toBeGreaterThan(TUNING.source.halfWidth);
  });
});
