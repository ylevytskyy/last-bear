import { describe, expect, it } from 'vitest';
import { NO_INPUT, type Input } from './input';
import type { Block, EnemySpawn, Level } from './level';
import { createSim, type Sim, type SimEvent } from './sim';
import { TUNING } from './tuning';

const FLOOR: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 30, y: 0.5, z: 30 } };
const bee = (z: number): EnemySpawn => ({ id: 'b1', kind: 'bee', position: { x: 0, y: 1.5, z }, facing: Math.PI });
const level = (enemies: EnemySpawn[]): Level => ({ blocks: [FLOOR], spawn: { x: 0, y: 0, z: 0 }, killY: -20, enemies });
const types = (events: SimEvent[]) => events.map((e) => e.type);
function steps(sim: Sim, n: number, input: Input = NO_INPUT): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...sim.step(input));
  return out;
}

describe('Window in the rules', () => {
  it('opens on the step a bee starts its windup 3 m away', async () => {
    const sim = await createSim(level([bee(3)]));
    const events = sim.step(NO_INPUT);
    expect(events).toContainEqual({ type: 'windowOpened', enemyId: 'b1' });
    expect(sim.timeScale).toBe(TUNING.slowdownTimeScale);
    expect(sim.slowdown.open).toBe(true);
    expect(sim.slowdown.enemyId).toBe('b1');
    expect(sim.slowdown.remaining).toBeCloseTo(1.2, 6);
    sim.dispose();
  });

  it('without Shift it closes after about 15 steps and the attack still lands', async () => {
    const sim = await createSim(level([bee(3)]));
    sim.step(NO_INPUT);
    const before = sim.slowdown.remaining;
    sim.step(NO_INPUT);
    expect(before - sim.slowdown.remaining).toBeCloseTo(1 / 12, 6);
    let closedAfter = 1;
    let closing: SimEvent[] = [];
    while (sim.slowdown.open && closedAfter < 40) {
      closing = sim.step(NO_INPUT);
      closedAfter++;
    }
    expect(closedAfter + 1).toBeGreaterThanOrEqual(14);
    expect(closedAfter + 1).toBeLessThanOrEqual(16);
    expect(closing).toContainEqual({ type: 'windowClosed', reflexed: false });
    expect(sim.timeScale).toBe(1);
    const later = steps(sim, 120);
    expect(later).toContainEqual({ type: 'heartLost', cause: 'hit' });
    sim.dispose();
  });

  it('the same attack never reopens the Window; the bee’s next attack does', async () => {
    const sim = await createSim(level([bee(3)]));
    const events = steps(sim, 60 * 8);
    const t = types(events);
    const windups = t.map((x, i) => (x === 'enemyWindup' ? i : -1)).filter((i) => i >= 0);
    const opens = t.map((x, i) => (x === 'windowOpened' ? i : -1)).filter((i) => i >= 0);
    expect(windups.length).toBeGreaterThanOrEqual(2);
    // Рівно одне Вікно між першим і другим замахом, і ще одне після другого.
    expect(opens.filter((i) => i < windups[1]!)).toHaveLength(1);
    expect(opens.filter((i) => i > windups[1]! && (windups[2] === undefined || i < windups[2]))).toHaveLength(1);
    sim.dispose();
  });

  it('a windup outside the sensor opens the Window once the dash brings the bee inside it', async () => {
    const sim = await createSim(level([bee(5)]));
    let openedAt: number | null = null;
    let state = '';
    for (let i = 0; i < 120 && openedAt === null; i++) {
      const e = sim.step(NO_INPUT);
      if (e.some((x) => x.type === 'windowOpened')) {
        openedAt = sim.enemies[0]!.position.z;
        state = sim.enemies[0]!.state;
      }
    }
    expect(state).toBe('DASH');
    expect(openedAt).not.toBeNull();
    expect(openedAt!).toBeLessThan(TUNING.sensorRadius);
    expect(openedAt!).toBeGreaterThan(TUNING.sensorRadius - TUNING.bee.dashSpeed * TUNING.step - 0.01);
    sim.dispose();
  });

  it('no Window opens while she is invulnerable after a hit', async () => {
    const b2: EnemySpawn = { id: 'b2', kind: 'bee', position: { x: -7, y: 1.5, z: 0 }, facing: 0 };
    const sim = await createSim(level([bee(3), b2]));
    const events: SimEvent[] = [];
    let b2InSensorWhileInvulnerable = false;
    for (let i = 0; i < 200; i++) {
      events.push(...sim.step(NO_INPUT));
      const e = sim.enemies.find((x) => x.id === 'b2')!;
      const p = sim.sofiyka.position;
      if (sim.sofiyka.invulnerable > 0 && e.attacking && Math.hypot(e.position.x - p.x, e.position.z - p.z) < TUNING.sensorRadius) {
        b2InSensorWhileInvulnerable = true;
      }
    }
    expect(b2InSensorWhileInvulnerable).toBe(true); // сценарій справді перевіряє правило
    const opensForB2 = events.filter((e) => e.type === 'windowOpened' && e.enemyId === 'b2');
    expect(opensForB2).toHaveLength(0);
    sim.dispose();
  });

  it('a respawn closes an open Window', async () => {
    const b2: EnemySpawn = { id: 'b2', kind: 'bee', position: { x: 5, y: 1.5, z: 0 }, facing: 0 };
    const sim = await createSim(level([bee(3), b2]), { ...TUNING, hearts: 1 });
    const events: SimEvent[] = [];
    let openAtRespawn = false;
    for (let i = 0; i < 200; i++) {
      const open = sim.slowdown.open;
      const e = sim.step(NO_INPUT);
      events.push(...e);
      if (types(e).includes('respawned')) {
        openAtRespawn = open;
        expect(e).toContainEqual({ type: 'windowClosed', reflexed: false });
        break;
      }
    }
    expect(openAtRespawn).toBe(true); // Вікно було відкрите перед Відродженням
    expect(sim.slowdown.open).toBe(false);
    expect(sim.timeScale).toBe(1);
    sim.dispose();
  });

  it('a Blink step still runs the timers and the enemies', async () => {
    const sim = await createSim(level([bee(6)]));
    for (let i = 0; i < 300 && sim.sofiyka.invulnerable === 0; i++) sim.step(NO_INPUT);
    steps(sim, 20); // відкидання скінчилось
    const invulnerable = sim.sofiyka.invulnerable;
    const beeTime = sim.enemies[0]!.stateTime;
    expect(invulnerable).toBeGreaterThan(0);
    const events = sim.step({ ...NO_INPUT, blink: true });
    expect(types(events)).toContain('blinked');
    expect(sim.sofiyka.mode).toBe('BLINK');
    expect(sim.sofiyka.invulnerable).toBeCloseTo(invulnerable - TUNING.step, 9);
    expect(sim.enemies[0]!.stateTime).toBeCloseTo(beeTime + TUNING.step, 9);
    sim.dispose();
  });
});
