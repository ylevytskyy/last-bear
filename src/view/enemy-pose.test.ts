import { describe, expect, it } from 'vitest';
import { enemyPose } from './enemy-pose';

describe('enemyPose', () => {
  it('a bee winding up shakes and reddens more as the windup goes on; a hovering bee is still', () => {
    const start = enemyPose('WINDUP', 'bee', 0);
    const late = enemyPose('WINDUP', 'bee', 0.8);
    expect(late.shake).toBeGreaterThan(start.shake);
    expect(late.tint).toBeGreaterThan(start.tint);
    expect(enemyPose('HOVER', 'bee', 1).shake).toBe(0);
    expect(enemyPose('HOVER', 'bee', 1).tint).toBe(0);
  });

  it('a stuck bee has still wings; a hovering one beats them', () => {
    expect(enemyPose('STUCK', 'bee', 1).wingSpeed).toBe(0);
    expect(enemyPose('HOVER', 'bee', 1).wingSpeed).toBeGreaterThan(0);
  });

  it('a turtle’s flask glows brighter through the windup, never dimmer', () => {
    let prev = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const g = enemyPose('WINDUP', 'turtle', t).flaskGlow;
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
    expect(enemyPose('WINDUP', 'turtle', 1).flaskGlow).toBeGreaterThan(enemyPose('WINDUP', 'turtle', 0).flaskGlow);
  });

  it('a walking turtle does not shake', () => {
    expect(enemyPose('WALK', 'turtle', 0.5).shake).toBe(0);
  });
});
