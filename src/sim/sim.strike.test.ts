import { describe, expect, it } from 'vitest';
import { NO_INPUT, type Input } from './input';
import type { Block, EnemySpawn, Level, Vec3 } from './level';
import { createSim, type Sim, type SimEvent } from './sim';
import { TUNING, type Tuning } from './tuning';

const FLOOR: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 30, y: 0.5, z: 30 } };
const bee = (x: number, y: number, z: number): EnemySpawn => ({ id: 'b1', kind: 'bee', position: { x, y, z }, facing: Math.PI });
const turtle = (z: number): EnemySpawn => ({ id: 't1', kind: 'turtle', position: { x: 0, y: 0, z }, facing: Math.PI });
const level = (enemies: EnemySpawn[], blocks: Block[] = [FLOOR]): Level => ({ blocks, spawn: { x: 0, y: 0, z: 0 }, killY: -20, enemies });
const STRIKE: Input = { ...NO_INPUT, strike: true };
const types = (events: SimEvent[]) => events.map((e) => e.type);
function steps(sim: Sim, n: number, input: Input = NO_INPUT): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...sim.step(input));
  return out;
}
/** Іде до `target` по xz, доки не буде ближче за `stop`, і повертається до нього обличчям. */
function approach(sim: Sim, target: Vec3, stop: number): void {
  for (let i = 0; i < 400; i++) {
    const p = sim.sofiyka.position;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < stop) {
      sim.step({ ...NO_INPUT, moveX: (dx / d) * 1e-3, moveZ: (dz / d) * 1e-3 });
      return;
    }
    sim.step({ ...NO_INPUT, moveX: dx / d, moveZ: dz / d });
  }
  throw new Error('never got there');
}
/** Бджола ривкає в старе місце Софійки, вона вже збоку; повертає застряглу Бджолу. */
async function stuckBee(blocks: Block[] = [FLOOR], tuning: Tuning = TUNING) {
  const sim = await createSim(level([bee(0, 1.5, 6)], blocks), tuning);
  sim.step(NO_INPUT);
  steps(sim, 24, { ...NO_INPUT, moveX: 1 });
  for (let i = 0; i < 200 && sim.enemies[0]!.state !== 'STUCK'; i++) sim.step(NO_INPUT);
  expect(sim.enemies[0]!.state).toBe('STUCK');
  return sim;
}

describe('Strike in the rules', () => {
  it('a strike at a stuck bee 1 m ahead defeats it', async () => {
    const sim = await stuckBee();
    approach(sim, sim.enemies[0]!.position, 1);
    const events = steps(sim, 25, STRIKE);
    expect(events).toContainEqual({ type: 'struck', enemyId: 'b1', hit: true });
    expect(events).toContainEqual({ type: 'enemyDefeated', id: 'b1' });
    expect(sim.enemies).toHaveLength(0);
    sim.dispose();
  });

  it('a hovering bee is not hurt', async () => {
    const calm: Tuning = { ...TUNING, bee: { ...TUNING.bee, aggroRadius: 0.1 } };
    const sim = await createSim(level([bee(0, 1.5, 1)]), calm);
    const events = steps(sim, 25, STRIKE);
    expect(sim.enemies[0]!.state).toBe('HOVER');
    expect(events).toContainEqual({ type: 'struck', enemyId: 'b1', hit: false });
    expect(types(events)).not.toContain('enemyDefeated');
    expect(sim.enemies).toHaveLength(1);
    sim.dispose();
  });

  it('a turtle shrugs off a strike from the front, but falls to one at its flask after a Reflex', async () => {
    const front = await createSim(level([turtle(2)]));
    const events = steps(front, 25, STRIKE);
    expect(events.filter((e) => e.type === 'struck')).toEqual([{ type: 'struck', enemyId: 't1', hit: false }]); // раз за Удар
    expect(front.enemies).toHaveLength(1);
    front.dispose();

    const back = await createSim(level([turtle(2)]));
    back.step(NO_INPUT);
    expect(back.slowdown.open).toBe(true);
    expect(types(back.step({ ...NO_INPUT, blink: true }))).toContain('reflexed');
    const after = steps(back, 25, STRIKE);
    expect(after).toContainEqual({ type: 'struck', enemyId: 't1', hit: true });
    expect(after).toContainEqual({ type: 'enemyDefeated', id: 't1' });
    expect(back.enemies).toHaveLength(0);
    back.dispose();
  });

  it('holding the key strikes once; release and press strikes again; a strike works in the air', async () => {
    const sim = await createSim(level([]));
    const held = steps(sim, 60, STRIKE);
    expect(held.filter((e) => e.type === 'struck')).toEqual([{ type: 'struck', enemyId: null, hit: false }]);
    sim.step(NO_INPUT);
    expect(types(steps(sim, 25, STRIKE))).toContain('struck');
    // Новий натиск посеред Удару не починає нового.
    const quick = [...sim.step(NO_INPUT), ...sim.step(STRIKE), ...steps(sim, 8), ...sim.step(STRIKE), ...steps(sim, 25)];
    expect(quick.filter((e) => e.type === 'struck')).toHaveLength(1);

    sim.step(NO_INPUT);
    sim.step({ ...NO_INPUT, jump: true });
    sim.step(STRIKE);
    expect(sim.sofiyka.grounded).toBe(false);
    expect(sim.sofiyka.mode).toBe('ATTACK');
    expect(types(steps(sim, 10, STRIKE))).toContain('struck');
    steps(sim, Math.round(TUNING.strikeSeconds / TUNING.step));
    expect(sim.sofiyka.mode).not.toBe('ATTACK');
    sim.dispose();
  });

  it('the hitbox works only in the middle of the swing', async () => {
    const sim = await createSim(level([]));
    const first = sim.step(STRIKE);
    expect(types(first)).not.toContain('struck'); // хітбокс ще не діє
    sim.dispose();

    // Бджола заходить у хітбокс лише на ~0.29 с Удару, коли той уже не діє.
    const late = await stuckBee();
    steps(late, 24, { ...NO_INPUT, moveX: 1 });
    approach(late, late.enemies[0]!.position, 3.85);
    const b = late.enemies[0]!.position;
    const p = late.sofiyka.position;
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    const run: Input = { ...STRIKE, moveX: (b.x - p.x) / d, moveZ: (b.z - p.z) / d };
    const events = steps(late, 21, run);
    expect(types(events)).not.toContain('enemyDefeated');
    expect(events.filter((e) => e.type === 'struck')).toEqual([{ type: 'struck', enemyId: null, hit: false }]);
    late.dispose();
  });

  it('a defeated bee is back, full and hovering, after she respawns', async () => {
    const small: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 8, y: 0.5, z: 10 } };
    const sim = await stuckBee([small], { ...TUNING, hearts: 1 });
    approach(sim, sim.enemies[0]!.position, 1);
    expect(types(steps(sim, 25, STRIKE))).toContain('enemyDefeated');
    expect(sim.enemies).toHaveLength(0);
    let respawned = false;
    for (let i = 0; i < 400 && !respawned; i++) respawned = types(sim.step({ ...NO_INPUT, moveX: 1 })).includes('respawned');
    expect(respawned).toBe(true);
    expect(sim.enemies).toHaveLength(1);
    expect(sim.enemies[0]!.state).toBe('HOVER');
    expect(sim.enemies[0]!.hp).toBe(TUNING.hitsToDefeat.bee);
    sim.dispose();
  });
});
