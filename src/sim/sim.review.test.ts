import { describe, expect, it } from 'vitest';
import { NO_INPUT, type Input } from './input';
import type { Block, EnemySpawn, Level } from './level';
import { createSim, type Sim, type SimEvent } from './sim';
import { strikeHits } from './strike';
import { TUNING } from './tuning';

const FLOOR: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 30, y: 0.5, z: 30 } };
const bee = (id: string, x: number, z: number): EnemySpawn => ({ id, kind: 'bee', position: { x, y: 1.5, z }, facing: Math.PI });
const turtle = (z: number, y = 0): EnemySpawn => ({ id: 't1', kind: 'turtle', position: { x: 0, y, z }, facing: Math.PI });
const level = (enemies: EnemySpawn[], blocks: Block[] = [FLOOR], spawn = { x: 0, y: 0, z: 0 }): Level => ({ blocks, spawn, killY: -20, enemies });
const types = (events: SimEvent[]) => events.map((e) => e.type);
function steps(sim: Sim, n: number, input: Input = NO_INPUT): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...sim.step(input));
  return out;
}

describe('review fixes', () => {
  it('a bee that turns stuck in the middle of a swing that it first blocked can still be beaten by that swing', async () => {
    // Скан моменту натиску: принаймні в одному випадку Бджола в DASH у хітбоксі (blocked), застрягає й гине від того ж Удару.
    let beatenAfterBlock = false;
    for (let wait = 0; wait <= 45 && !beatenAfterBlock; wait++) {
      // Без відкидання й HURT удар Бджоли не скасовує Удар Софійки: перевіряємо лише правило «blocked не витрачає Удар».
      const sim = await createSim(level([bee('b1', 0, 6)]), { ...TUNING, knockbackDistance: 0, hurtSeconds: 0 });
      for (let i = 0; i < 300 && sim.enemies[0]!.state !== 'DASH'; i++) sim.step(NO_INPUT);
      steps(sim, wait);
      const events = steps(sim, 25, { ...NO_INPUT, strike: true });
      const struck = events.filter((e) => e.type === 'struck' && e.enemyId === 'b1');
      if (struck.length === 2 && types(events).includes('enemyDefeated')) beatenAfterBlock = true;
      sim.dispose();
    }
    expect(beatenAfterBlock).toBe(true);
  });

  it('a bee that dodged into the floor stays above it', async () => {
    for (const z of [2.5, 3, 4]) {
      const sim = await createSim(level([bee('b1', 0, z)]));
      sim.step(NO_INPUT);
      steps(sim, 24, { ...NO_INPUT, moveX: 1 });
      for (let i = 0; i < 200 && sim.enemies[0]!.state !== 'STUCK'; i++) sim.step(NO_INPUT);
      expect(sim.enemies[0]!.state).toBe('STUCK');
      expect(sim.enemies[0]!.position.y).toBeGreaterThanOrEqual(TUNING.bee.radius - 0.02);
      sim.dispose();
    }
  });

  it('a hit that knocks her off a ledge costs one heart, not two', async () => {
    const ledge: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 3, y: 0.5, z: 3 } };
    const sim = await createSim(level([bee('b1', 0, 3)], [ledge], { x: 0, y: 0, z: -2 }));
    const events = steps(sim, 400);
    expect(types(events)).toContain('returned');
    const firstReturn = types(events).indexOf('returned');
    expect(types(events.slice(0, firstReturn + 1)).filter((t) => t === 'heartLost')).toHaveLength(1);
    sim.dispose();
  });

  it('a turtle far below her neither winds up nor hits', async () => {
    const high: Block = { kind: 'solid', center: { x: 0, y: 4.5, z: 0 }, halfExtents: { x: 2, y: 0.5, z: 2 } };
    const sim = await createSim(level([turtle(1.5)], [FLOOR, high], { x: 0, y: 5, z: 0 }));
    const events = steps(sim, 240);
    expect(types(events)).not.toContain('enemyWindup');
    expect(types(events)).not.toContain('heartLost');
    sim.dispose();
  });

  it('a second spin hits again once she is no longer invulnerable', async () => {
    const wall: Block = { kind: 'solid', center: { x: 0, y: 2, z: -0.7 }, halfExtents: { x: 5, y: 2, z: 0.25 } };
    const sim = await createSim(level([turtle(1.5)], [FLOOR, wall]));
    const events = steps(sim, 60 * 8);
    expect(types(events).filter((t) => t === 'heartLost').length).toBeGreaterThanOrEqual(2);
    sim.dispose();
  });

  it('with two hits to defeat, the first hit leaves the bee stuck and the second defeats it', async () => {
    const sim = await createSim(level([bee('b1', 0, 6)]), { ...TUNING, hitsToDefeat: { ...TUNING.hitsToDefeat, bee: 2 } });
    sim.step(NO_INPUT);
    steps(sim, 24, { ...NO_INPUT, moveX: 1 });
    for (let i = 0; i < 200 && sim.enemies[0]!.state !== 'STUCK'; i++) sim.step(NO_INPUT);
    const b = sim.enemies[0]!.position;
    for (let i = 0; i < 200; i++) {
      const p = sim.sofiyka.position;
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < 1) break;
      sim.step({ ...NO_INPUT, moveX: (b.x - p.x) / d, moveZ: (b.z - p.z) / d });
    }
    const p = sim.sofiyka.position;
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    const face = { ...NO_INPUT, moveX: ((b.x - p.x) / d) * 1e-3, moveZ: ((b.z - p.z) / d) * 1e-3 };
    const first = steps(sim, 25, { ...face, strike: true });
    expect(first).toContainEqual({ type: 'struck', enemyId: 'b1', hit: true });
    expect(types(first)).not.toContain('enemyDefeated');
    expect(sim.enemies[0]!.hp).toBe(1);
    sim.step(face);
    const second = steps(sim, 25, { ...face, strike: true });
    expect(types(second)).toContain('enemyDefeated');
    sim.dispose();
  });

  it('a respawn after a lethal hit leaves her standing at the spawn, not thrown away from it', async () => {
    const sim = await createSim(level([bee('b1', 0, 6)]), { ...TUNING, hearts: 1 });
    for (let i = 0; i < 300 && !types(sim.step(NO_INPUT)).includes('respawned'); i++);
    steps(sim, 20);
    expect(Math.hypot(sim.sofiyka.position.x, sim.sofiyka.position.z)).toBeLessThan(0.05);
    sim.dispose();
  });

  it('a recovering bee blocks a strike', () => {
    const e = { id: 'b', kind: 'bee' as const, position: { x: 0, y: 0.5, z: 1 }, facing: 0, state: 'RECOVER' as const, stateTime: 0, attacking: false, vulnerable: false, hp: 1 };
    expect(strikeHits({ position: { x: 0, y: 0, z: 0 }, facing: 0 }, e, TUNING)).toBe('blocked');
  });
});
