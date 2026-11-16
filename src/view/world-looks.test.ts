import { describe, expect, it } from 'vitest';
import { worldLook } from './world-looks';

describe('worldLook', () => {
  it('gives each world its own sky and ground', () => {
    const looks = (['backrooms', 'village', 'honeycombs'] as const).map(worldLook);
    expect(new Set(looks.map((l) => l.background)).size).toBe(3);
    expect(new Set(looks.map((l) => l.ground)).size).toBe(3);
  });

  it('the backrooms are yellow, the honeycombs are sky blue, the village has a purple fog', () => {
    const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const [r, g, b] = hex(worldLook('backrooms').wall);
    expect(r).toBeGreaterThan(b! + 60);
    expect(g).toBeGreaterThan(b! + 60);
    const [sr, , sb] = hex(worldLook('honeycombs').background);
    expect(sb).toBeGreaterThan(sr! + 40);
    const [fr, fg, fb] = hex(worldLook('village').fog.color);
    expect(fr).toBeGreaterThan(fg!);
    expect(fb).toBeGreaterThan(fg!);
  });
});
