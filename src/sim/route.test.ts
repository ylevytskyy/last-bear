import { describe, expect, it } from 'vitest';
import { NO_INPUT } from './input';
import type { Block, Level, Route } from './level';
import { walkRoute } from './route';
import { createSim, type SimEvent } from './sim';
import { TUNING } from './tuning';

const types = (events: SimEvent[]) => events.map((e) => e.type);
const block = (x: number, y: number, z: number, hx: number, hy: number, hz: number): Block => ({
  kind: 'solid',
  center: { x, y, z },
  halfExtents: { x: hx, y: hy, z: hz },
});
const pt = (x: number, z: number) => ({ x, y: 0, z });

describe('walkRoute: points and the end of a route', () => {
  const FIELD: Level = { blocks: [block(0, -0.5, 20, 30, 0.5, 40)], spawn: pt(0, 0), killY: -10 };

  it('walks the points in order, reports the last one reached, and stops when the route is done', async () => {
    const sim = await createSim(FIELD);
    const route: Route = { points: [pt(0, 0), pt(0, 5), pt(5, 5), pt(5, 0)], actions: [] };
    const run = walkRoute(sim, route, 1000);
    expect(run.reached).toBe(3);
    expect(run.steps).toBeLessThan(200);
    expect(Math.hypot(sim.sofiyka.position.x - 5, sim.sofiyka.position.z)).toBeLessThan(0.5);
    sim.dispose();
  });

  it('stops at maxSteps and reports how far it got', async () => {
    const sim = await createSim(FIELD);
    const run = walkRoute(sim, { points: [pt(0, 0), pt(0, 30)], actions: [] }, 30);
    expect(run.steps).toBe(30);
    expect(run.reached).toBe(0);
    expect(sim.sofiyka.position.z).toBeGreaterThan(1);
    sim.dispose();
  });

  it('a point is reached under 0.4 m, not over it', async () => {
    const sim = await createSim(FIELD);
    const run = walkRoute(sim, { points: [pt(0, 0), pt(0, 3)], actions: [] }, 1000);
    expect(run.reached).toBe(1);
    expect(3 - sim.sofiyka.position.z).toBeGreaterThan(0.0);
    expect(3 - sim.sofiyka.position.z).toBeLessThan(0.4 + 0.1);
    sim.dispose();
  });
});

describe('walkRoute: blink waits for its cooldown', () => {
  const FIELD: Level = { blocks: [block(0, -0.5, 20, 30, 0.5, 40)], spawn: pt(0, 0), killY: -10 };
  const route: Route = {
    points: [pt(0, 0), pt(0, 6), pt(0, 12)],
    actions: [
      { at: 0, do: 'blink' },
      { at: 1, do: 'blink' },
    ],
  };

  it('two blinks one after another: the second is pressed only when the Blink is ready', async () => {
    const sim = await createSim(FIELD);
    const run = walkRoute(sim, route, 1000);
    expect(types(run.events).filter((t) => t === 'blinked')).toHaveLength(2);
    expect(run.reached).toBe(2);
    sim.dispose();
  });
});

describe('walkRoute: a jump into a bud waits until it has opened', () => {
  const SLOW = { ...TUNING, village: { ...TUNING.village, flowerOpenSeconds: 3 } };
  const level: Level = {
    blocks: [block(0, -0.5, 10, 20, 0.5, 20)],
    spawn: pt(0, 0),
    killY: -10,
    flowers: [{ id: 'f', position: pt(0, 9), color: 'yellow', opens: true, to: 'village' }],
  };
  // Стоїть за 0.8 м від Квітки: за 0.7 м капсула впритул до ніжки, і стрибок у ній загрузає (виміряно в S39).
  const route: Route = { points: [pt(0, 0), pt(0, 8.2)], actions: [{ at: 1, do: 'jump' }] };

  it('one jump, and it is the one that enters, even when the bud opens slowly', async () => {
    const sim = await createSim(level, SLOW);
    const run = walkRoute(sim, route, 1500, { level });
    expect(run.events.filter((e) => e.type === 'jumped')).toHaveLength(1);
    expect(run.events.filter((e) => e.type === 'flowerEntered')).toEqual([{ type: 'flowerEntered', id: 'f' }]);
    sim.dispose();
  });
});

describe('walkRoute: the last jump of a route is made from the point itself', () => {
  // Точка стрибка за 0.9 м від Квітки: «дійшла» за 0.4 м — це 1.3 м від Квітки, а бутон ловить лише за 1.2 м.
  const level: Level = {
    blocks: [block(0, -0.5, 10, 20, 0.5, 20)],
    spawn: pt(0, 0),
    killY: -10,
    flowers: [{ id: 'f', position: pt(0, 9), color: 'yellow', opens: true, to: 'village' }],
  };
  const route: Route = { points: [pt(0, 0), pt(0, 8.1)], actions: [{ at: 1, do: 'jump' }] };

  it('she walks up to the stand before the jump, so the bud catches her at once', async () => {
    const sim = await createSim(level);
    const run = walkRoute(sim, route, 1500, { level });
    expect(run.events.filter((e) => e.type === 'jumped')).toHaveLength(1);
    expect(run.events.filter((e) => e.type === 'flowerEntered')).toEqual([{ type: 'flowerEntered', id: 'f' }]);
    sim.dispose();
  });

  it('a jump in the middle of a route is still made on the run, not from the stand', async () => {
    const field: Level = { blocks: [block(0, -0.5, 10, 20, 0.5, 20), block(0, 0.5, 5, 5, 0.5, 0.3)], spawn: pt(0, 0), killY: -10 };
    const sim = await createSim(field);
    const mid: Route = { points: [pt(0, 0), pt(0, 3.5), pt(0, 8)], actions: [{ at: 1, do: 'jump' }] };
    const run = walkRoute(sim, mid, 600);
    expect(run.reached).toBe(2);
    expect(run.events.filter((e) => e.type === 'jumped')).toHaveLength(1);
    sim.dispose();
  });
});

describe('walkRoute: waitMover', () => {
  /** Платформа P1 (x до 0), рухома A (1.2) ↔ B (10.9) над порожнечею, платформа P2 (x від 12). */
  const level: Level = {
    blocks: [block(-3, -0.5, 0, 3, 0.5, 3), block(15, -0.5, 0, 3, 0.5, 3)],
    spawn: { x: -2, y: 0, z: 0 },
    killY: -10,
    movers: [{ id: 'ferry', block: block(1.2, -0.25, 0, 1.5, 0.25, 1.5), to: { x: 10.9, y: -0.25, z: 0 } }],
  };
  const route: Route = {
    points: [pt(-2, 0), pt(-0.6, 0), pt(1.6, 0), pt(14, 0)],
    actions: [
      { at: 1, do: { waitMover: 'ferry', near: 'A' } },
      { at: 2, do: { waitMover: 'ferry', near: 'B' } },
    ],
  };

  it('waits for the platform at A, rides it to B and walks off to the far side without falling', async () => {
    const sim = await createSim(level);
    // Платформа вже поїхала: тепер вона посередині шляху, і чекати доведеться.
    for (let i = 0; i < 150; i++) sim.step(NO_INPUT);
    expect(sim.movers[0]!.position.x).toBeGreaterThan(4);
    const run = walkRoute(sim, route, 3000, { level });
    expect(run.reached).toBe(3);
    expect(types(run.events)).not.toContain('heartLost');
    expect(types(run.events)).not.toContain('returned');
    expect(sim.sofiyka.position.x).toBeGreaterThan(13);
    expect(run.steps).toBeGreaterThan(300); // справді чекала
    sim.dispose();
  });

  it('without waiting she walks into the gap', async () => {
    const sim = await createSim(level);
    for (let i = 0; i < 150; i++) sim.step(NO_INPUT);
    const run = walkRoute(sim, route, 3000, { level, skip: ['waitMover'] });
    expect(types(run.events)).toContain('returned');
    sim.dispose();
  });

  it('needs the level to know the ends of the platform', async () => {
    const sim = await createSim(level);
    expect(() => walkRoute(sim, route, 600)).toThrow(/waitMover/);
    sim.dispose();
  });
});

describe('walkRoute: strikeSource', () => {
  const level: Level = {
    blocks: [block(0, -0.5, 4, 10, 0.5, 10)],
    spawn: pt(0, 0),
    killY: -10,
    source: { id: 'source', position: pt(0, 4) },
  };
  const CLOSE = { ...TUNING, source: { ...TUNING.source, pickupRadius: 0.6 } };
  const route: Route = { points: [pt(0, 0), pt(0, 1.3)], actions: [{ at: 1, do: 'strikeSource' }] };

  it('strikes until the source is broken, then goes to the key and picks it up', async () => {
    const sim = await createSim(level, CLOSE);
    const run = walkRoute(sim, route, 1500, { level });
    expect(types(run.events).filter((t) => t === 'sourceStruck')).toHaveLength(3);
    expect(types(run.events)).toContain('sourceBroken');
    expect(types(run.events)).toContain('keyPicked');
    expect(sim.sofiyka.keys).toBe(1);
    expect(sim.source).toEqual({ hp: 0, broken: true, keyAt: null });
    expect(types(run.events)).not.toContain('struck');
    sim.dispose();
  });

  it('with skip she does not strike', async () => {
    const sim = await createSim(level, CLOSE);
    const run = walkRoute(sim, route, 300, { level, skip: ['strikeSource'] });
    expect(types(run.events)).not.toContain('sourceStruck');
    expect(sim.source!.hp).toBe(3);
    sim.dispose();
  });
});
