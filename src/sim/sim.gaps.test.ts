import { describe, expect, it } from 'vitest';
import { NO_INPUT, type Input } from './input';
import type { Block, EnemySpawn, Level, Vec3 } from './level';
import { childBot, playScenario } from './scenario';
import { createSim, type Sim, type SimEvent } from './sim';
import { TUNING, type Tuning } from './tuning';

const FLOOR: Block = { kind: 'solid', center: { x: 0, y: -0.5, z: 0 }, halfExtents: { x: 30, y: 0.5, z: 30 } };
const bee = (x: number, y: number, z: number): EnemySpawn => ({ id: 'b1', kind: 'bee', position: { x, y, z }, facing: Math.PI });
const turtle = (z: number): EnemySpawn => ({ id: 't1', kind: 'turtle', position: { x: 0, y: 0, z }, facing: Math.PI });
const level = (enemies: EnemySpawn[]): Level => ({ blocks: [FLOOR], spawn: { x: 0, y: 0, z: 0 }, killY: -20, enemies });
const STRIKE: Input = { ...NO_INPUT, strike: true };
const types = (events: SimEvent[]) => events.map((e) => e.type);
const STRIKE_STEPS = Math.round(TUNING.strikeSeconds / TUNING.step);
function steps(sim: Sim, n: number, input: Input = NO_INPUT): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...sim.step(input));
  return out;
}
/** Іде до `target` по xz, доки не буде ближче за `stop`. */
function walkTo(sim: Sim, target: Vec3, stop: number): void {
  for (let i = 0; i < 400; i++) {
    const p = sim.sofiyka.position;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < stop) return;
    sim.step({ ...NO_INPUT, moveX: dx / d, moveZ: dz / d });
  }
  throw new Error('never got there');
}

describe('gaps in Iteration 2 coverage', () => {
  it('a bee hit in the middle of a strike cancels it: no ATTACK mode and no struck events afterwards', async () => {
    const sim = await createSim(level([bee(0, 1.5, 6)]));
    // Чекаємо Ривок і починаємо Удар, коли Бджола вже за кілька кроків від Софійки.
    for (let i = 0; i < 300 && !(sim.enemies[0]!.state === 'DASH' && sim.enemies[0]!.position.z < 1.4); i++) sim.step(NO_INPUT);
    expect(sim.enemies[0]!.state).toBe('DASH');
    const out: SimEvent[][] = [];
    const modes: string[] = [];
    for (let i = 0; i < STRIKE_STEPS + 2; i++) {
      out.push(sim.step(STRIKE)); // Удар почався на кроці 0
      modes.push(sim.sofiyka.mode);
    }
    expect(modes[0]).toBe('ATTACK');
    const hitStep = out.findIndex((e) => e.some((x) => x.type === 'heartLost'));
    // Бджола влучає раніше, ніж хітбокс Удару починає діяти (0.1 с = 6 кроків).
    expect(hitStep).toBeGreaterThan(0);
    expect(hitStep).toBeLessThan(5);
    expect(sim.sofiyka.hearts).toBe(TUNING.hearts - 1);
    expect(out.slice(hitStep).flat().filter((e) => e.type === 'struck')).toEqual([]);
    expect(modes[hitStep]).toBe('HURT');
    // HURT триває 0.3 с (18 кроків), а Удар тривав би 0.35 с (21 крок): після HURT режиму ATTACK вже немає.
    expect(modes.slice(hitStep)).not.toContain('ATTACK');
    sim.dispose();
  });

  it('a Blink on the same step as a strike press swallows the strike', async () => {
    const sim = await createSim(level([]));
    const events = steps(sim, STRIKE_STEPS + 5, { ...NO_INPUT, blink: true, strike: true });
    expect(types(events)).toContain('blinked');
    expect(types(events)).not.toContain('struck');
    expect(sim.sofiyka.mode).not.toBe('ATTACK');
    sim.dispose();
  });

  it('a Blink during a knockback ends it: she does not slide on afterwards', async () => {
    const slow: Tuning = { ...TUNING, knockbackSeconds: 1.0 };
    const sim = await createSim(level([bee(0, 1.5, 3)]), slow);
    // Чекаємо влучання (вона обернена до +z; Бджола з +z, тож відкидає на −z).
    let hit = false;
    for (let i = 0; i < 300 && !hit; i++) hit = types(sim.step(NO_INPUT)).includes('heartLost');
    expect(hit).toBe(true);
    steps(sim, 4); // відкидання триває (1.0 с), Вікно вже не відкрите
    expect(sim.slowdown.open).toBe(false);
    const events = sim.step({ ...NO_INPUT, blink: true });
    expect(types(events)).toContain('blinked');
    const after = { ...sim.sofiyka.position };
    steps(sim, 40);
    expect(sim.sofiyka.position.x).toBeCloseTo(after.x, 3);
    expect(sim.sofiyka.position.z).toBeCloseTo(after.z, 3);
    sim.dispose();
  });

  it('killing a turtle in an open Window closes the Window without a Reflex and restores normal time', async () => {
    const long: Tuning = { ...TUNING, slowdownSeconds: 30, turtle: { ...TUNING.turtle, windupSeconds: 3 } };
    const sim = await createSim(level([turtle(2)]), long);
    sim.step(NO_INPUT);
    expect(sim.slowdown.open).toBe(true);
    expect(sim.timeScale).toBe(long.slowdownTimeScale);
    // Обходить Черепаху до Колби (позаду, на +z) і б'є, обернувшись до неї.
    walkTo(sim, { x: 0, y: 0, z: 3.3 }, 0.1);
    sim.step({ ...NO_INPUT, moveZ: -1e-3 });
    const events = steps(sim, STRIKE_STEPS + 2, STRIKE);
    expect(events).toContainEqual({ type: 'struck', enemyId: 't1', hit: true });
    expect(events).toContainEqual({ type: 'enemyDefeated', id: 't1' });
    expect(events.filter((e) => e.type === 'windowClosed')).toEqual([{ type: 'windowClosed', reflexed: false }]);
    expect(sim.slowdown.open).toBe(false);
    expect(sim.timeScale).toBe(1);
    sim.dispose();
  });

  describe('aggro boundary, driven by the child bot', () => {
    const MARGIN = 0.05;
    /** Відстань від Бджоли до центра капсули — так її міряє `stepBee`. */
    const beeDistance = (sim: Sim) => {
      const b = sim.enemies[0]!.position;
      const p = sim.sofiyka.position;
      return Math.hypot(b.x - p.x, b.y - (p.y + TUNING.capsuleHeight / 2), b.z - p.z);
    };
    const turtleDistance = (sim: Sim) => {
      const t = sim.enemies[0]!.position;
      const p = sim.sofiyka.position;
      return Math.hypot(t.x - p.x, t.z - p.z);
    };

    it('a bee winds up on the first step when her aggroRadius is 0.05 m beyond Sofiyka, and not when 0.05 m short', async () => {
      const probe = await createSim(level([bee(0, 0.7, 2)]));
      const d = beeDistance(probe);
      probe.dispose();
      const run = async (aggroRadius: number) => {
        const sim = await createSim(level([bee(0, 0.7, 2)]), { ...TUNING, bee: { ...TUNING.bee, aggroRadius } });
        const t = types(playScenario(sim, childBot, 1).events);
        sim.dispose();
        return t;
      };
      expect(await run(d + MARGIN)).toContain('enemyWindup');
      expect(await run(d - MARGIN)).not.toContain('enemyWindup');
    });

    it('a turtle winds up on the first step when attackRange is 0.05 m beyond Sofiyka, and not when 0.05 m short', async () => {
      const probe = await createSim(level([turtle(2.5)]));
      const d = turtleDistance(probe);
      probe.dispose();
      const run = async (attackRange: number) => {
        const sim = await createSim(level([turtle(2.5)]), { ...TUNING, turtle: { ...TUNING.turtle, attackRange } });
        const t = types(playScenario(sim, childBot, 1).events);
        sim.dispose();
        return t;
      };
      expect(await run(d + MARGIN)).toContain('enemyWindup');
      expect(await run(d - MARGIN)).not.toContain('enemyWindup');
    });
  });
});
