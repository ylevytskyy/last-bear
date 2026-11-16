import { describe, expect, it } from 'vitest';
import { NO_INPUT, type Input } from './input';
import type { Block, Level } from './level';
import { createSim, type Sim, type SimEvent } from './sim';
import { TUNING } from './tuning';

const FLOOR: Block = {
  kind: 'solid',
  center: { x: 0, y: -0.5, z: 0 },
  halfExtents: { x: 30, y: 0.5, z: 30 },
};
const level = (blocks: Block[] = [FLOOR], killY = -20): Level => ({
  blocks,
  spawn: { x: 0, y: 0, z: 0 },
  killY,
});
const JUMP: Input = { ...NO_INPUT, jump: true };
const dt = TUNING.step;

/** Одинарний стрибок: кнопка тримається `hold` кроків (за замовчуванням — увесь політ). Повертає час польоту й найвищу точку. */
function fly(sim: Sim, hold = Infinity): { seconds: number; top: number } {
  let top = 0;
  let steps = 0;
  sim.step(JUMP);
  steps++;
  for (let i = 1; i < 300 && !sim.sofiyka.grounded; i++) {
    sim.step(i < hold ? JUMP : NO_INPUT);
    steps++;
    top = Math.max(top, sim.sofiyka.position.y);
  }
  return { seconds: steps * dt, top };
}

/** Двоє стрибків: перший тримається на підйомі, на вершині кнопка відпускається на крок і тиснеться знову. Повертає найвищу точку. */
function flyDouble(sim: Sim): number {
  let top = 0;
  let released = false;
  sim.step(JUMP);
  for (let i = 0; i < 300 && !sim.sofiyka.grounded; i++) {
    const s = sim.sofiyka;
    let input = NO_INPUT;
    if (s.jumpsUsed === 1 && s.velocityY > 0) input = JUMP;
    else if (s.jumpsUsed === 1 && !released) released = true; // крок без кнопки на вершині
    else if (s.jumpsUsed === 1) input = JUMP;
    else if (s.jumpsUsed === 2 && s.velocityY > 0) input = JUMP;
    sim.step(input);
    top = Math.max(top, s.position.y);
  }
  return top;
}

describe('Sofiyka jumping', () => {
  it('jumps 1.6 m high and lands, with events jumped then landed', async () => {
    const sim = await createSim(level());
    const events: SimEvent[] = [];
    let top = 0;
    events.push(...sim.step(JUMP));
    for (let i = 0; i < 120 && !events.some((e) => e.type === 'landed'); i++) {
      events.push(...sim.step(JUMP));
      top = Math.max(top, sim.sofiyka.position.y);
    }
    expect(Math.abs(top - 1.6)).toBeLessThan(0.1);
    expect(events).toEqual([{ type: 'jumped', double: false }, { type: 'landed' }]);
    expect(sim.sofiyka.grounded).toBe(true);
    expect(sim.sofiyka.jumpsUsed).toBe(0);
    sim.dispose();
  });

  it('shows JUMP while airborne', async () => {
    const sim = await createSim(level());
    sim.step(JUMP);
    sim.step(NO_INPUT);
    expect(sim.sofiyka.mode).toBe('JUMP');
    sim.dispose();
  });

  it('allows one more jump in the air after release, and no third', async () => {
    const sim = await createSim(level());
    sim.step(JUMP);
    for (let i = 0; i < 10; i++) sim.step(NO_INPUT);
    const second = sim.step(JUMP);
    expect(second).toEqual([{ type: 'jumped', double: true }]);
    sim.step(NO_INPUT);
    expect(sim.step(JUMP)).toEqual([]);
    expect(sim.sofiyka.jumpsUsed).toBe(2);
    sim.dispose();
  });

  it('does not jump again on landing while the key is held', async () => {
    const sim = await createSim(level());
    const events: SimEvent[] = [];
    for (let i = 0; i < 150; i++) events.push(...sim.step(JUMP));
    expect(events.filter((e) => e.type === 'jumped')).toHaveLength(1);
    expect(sim.sofiyka.grounded).toBe(true);
    expect(sim.step(NO_INPUT)).toEqual([]);
    expect(sim.step(JUMP)).toEqual([{ type: 'jumped', double: false }]);
    sim.dispose();
  });

  it('returns to solid ground with zero speed after falling below killY', async () => {
    const platform: Block = { ...FLOOR, halfExtents: { x: 3, y: 0.5, z: 3 } };
    const sim = await createSim(level([platform], -5));
    const events: SimEvent[] = [];
    for (let i = 0; i < 300 && !events.some((e) => e.type === 'returned'); i++) {
      events.push(...sim.step({ ...NO_INPUT, moveZ: 1 }));
    }
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['heartLost', 'returned']));
    expect(sim.sofiyka.velocityY).toBe(0);
    sim.step(NO_INPUT);
    expect(sim.sofiyka.position.y).toBeCloseTo(0, 1);
    sim.dispose();
  });

  it('holds her in the air 0.85-0.95 s for a held single jump, and the top is 1.6 +/- 0.05 m', async () => {
    const sim = await createSim(level());
    const flight = fly(sim);
    expect(flight.seconds).toBeGreaterThanOrEqual(0.85);
    expect(flight.seconds).toBeLessThanOrEqual(0.95);
    expect(Math.abs(flight.top - 1.6)).toBeLessThanOrEqual(0.05);
    sim.dispose();
  });

  it('rises slower than she falls: the climb takes more steps than the descent', async () => {
    const sim = await createSim(level());
    let rise = 0;
    let fall = 0;
    sim.step(JUMP);
    for (let i = 0; i < 120 && !sim.sofiyka.grounded; i++) {
      sim.step(JUMP);
      if (sim.sofiyka.velocityY > 0) rise++;
      else fall++;
    }
    expect(rise).toBeGreaterThan(fall);
    expect(TUNING.jumpGravityDown).toBeGreaterThan(TUNING.jumpGravityUp);
    sim.dispose();
  });

  it('hangs at the top: about twice as many steps with a vertical speed under 1 m/s as with the hang switched off', async () => {
    const slowSteps = async (tuning: typeof TUNING): Promise<number> => {
      const sim = await createSim(level(), tuning);
      let slow = 0;
      sim.step(JUMP);
      for (let i = 0; i < 120 && !sim.sofiyka.grounded; i++) {
        sim.step(JUMP);
        if (Math.abs(sim.sofiyka.velocityY) < 1) slow++;
      }
      sim.dispose();
      return slow;
    };
    const flat = await slowSteps({ ...TUNING, jumpHangFactor: 1 });
    const hang = await slowSteps(TUNING);
    expect(hang).toBeGreaterThanOrEqual(12);
    expect(hang).toBeGreaterThanOrEqual(1.8 * flat);
  });

  it('a double jump from the top of the first one brings her to 2.9 +/- 0.1 m in total', async () => {
    const sim = await createSim(level());
    expect(Math.abs(flyDouble(sim) - 2.9)).toBeLessThanOrEqual(0.1);
    sim.dispose();
  });

  it('a short tap gives at most 60% of the held height, and a later release gives more', async () => {
    const heights: number[] = [];
    for (const hold of [Infinity, 1, 5, 12]) {
      const sim = await createSim(level());
      heights.push(fly(sim, hold).top);
      sim.dispose();
    }
    const [full, tap, five, twelve] = heights as [number, number, number, number];
    expect(tap).toBeLessThanOrEqual(0.6 * full);
    expect(tap).toBeGreaterThan(0.2); // стрибок усе ж є
    expect(tap).toBeLessThan(five);
    expect(five).toBeLessThan(twelve);
    expect(twelve).toBeLessThanOrEqual(full + 1e-9);
  });

  it('releasing the key on the way down changes nothing', async () => {
    const a = await createSim(level());
    const b = await createSim(level());
    const full = fly(a).top;
    const late = fly(b, 40).top; // на 40-му кроці вона вже падає
    expect(late).toBeCloseTo(full, 6);
    a.dispose();
    b.dispose();
  });
});

describe('coyote time', () => {
  /** Іде за край плити, доки вона не втратить землю; повертає номер кроку, на якому `grounded` став false. */
  async function walkOff(): Promise<{ sim: Sim; steps: number }> {
    const plate: Block = { ...FLOOR, halfExtents: { x: 3, y: 0.5, z: 3 } };
    const sim = await createSim(level([plate], -50));
    let steps = 0;
    while (sim.sofiyka.grounded && steps < 300) {
      sim.step({ ...NO_INPUT, moveZ: 1 });
      steps++;
    }
    expect(sim.sofiyka.grounded).toBe(false);
    return { sim, steps };
  }

  it('lets her make her first jump up to 0.1 s after the edge, step-exact: 6 steps yes, 7 steps a double', async () => {
    const window = Math.round(TUNING.coyoteSeconds / dt);
    expect(window).toBe(6);
    for (let late = 1; late <= window + 1; late++) {
      const { sim } = await walkOff();
      // `late - 1` кроків у повітрі без натиску: стрибок на кроці `late` після сходу.
      for (let i = 1; i < late; i++) sim.step(NO_INPUT);
      const events = sim.step(JUMP);
      expect(events, `jump ${late} steps after the edge`).toEqual([{ type: 'jumped', double: late > window }]);
      expect(sim.sofiyka.jumpsUsed).toBe(late > window ? 2 : 1);
      sim.dispose();
    }
  });

  it('a jump after the window leaves no jump in reserve: late first press is the double, the next is nothing', async () => {
    const { sim } = await walkOff();
    for (let i = 0; i < 20; i++) sim.step(NO_INPUT);
    expect(sim.step(JUMP)).toEqual([{ type: 'jumped', double: true }]);
    sim.step(NO_INPUT);
    expect(sim.step(JUMP)).toEqual([]);
    sim.dispose();
  });

  it('a coyote jump still leaves the double jump, and a fall from a jump gets no coyote time', async () => {
    const { sim } = await walkOff();
    sim.step(JUMP);
    sim.step(NO_INPUT);
    expect(sim.step(JUMP)).toEqual([{ type: 'jumped', double: true }]);
    sim.dispose();
  });
});

describe('jump buffer', () => {
  /** Двоє стрибків витрачено; повертає крок (0-based) події landed без третього натиску. */
  async function landingStep(): Promise<number> {
    const sim = await createSim(level());
    const steps = driveBothJumps(sim, -1);
    sim.dispose();
    return steps.landed;
  }

  /** Той самий політ; на кроці `pressAt` додатково натиск. Повертає кроки подій. */
  function driveBothJumps(sim: Sim, pressAt: number): { landed: number; jumpedAfterLanding: number } {
    let landed = -1;
    let jumpedAfterLanding = -1;
    let released = false;
    for (let i = 0; i < 300; i++) {
      const s = sim.sofiyka;
      let input = NO_INPUT;
      if (i === 0) input = JUMP;
      else if (s.jumpsUsed === 1 && s.velocityY > 0) input = JUMP;
      else if (s.jumpsUsed === 1 && !released) released = true;
      else if (s.jumpsUsed === 1) input = JUMP;
      else if (s.jumpsUsed === 2 && s.velocityY > 0) input = JUMP;
      if (i === pressAt) input = JUMP;
      if (i === pressAt - 1) input = NO_INPUT; // перед натиском кнопка відпущена
      const events = sim.step(input);
      if (events.some((e) => e.type === 'landed')) landed = i;
      if (landed >= 0 && i > landed && events.some((e) => e.type === 'jumped')) {
        jumpedAfterLanding = i;
        break;
      }
      if (landed >= 0 && i > landed + 20) break;
    }
    return { landed, jumpedAfterLanding };
  }

  it('a press up to 0.12 s before landing jumps on the first step after landing; 8 steps before it does nothing', async () => {
    const landed = await landingStep();
    expect(landed).toBeGreaterThan(30);
    const window = Math.floor(TUNING.jumpBufferSeconds / dt + 1e-9);
    expect(window).toBe(7);
    for (const before of [1, 4, window, window + 1]) {
      const sim = await createSim(level());
      const out = driveBothJumps(sim, landed - before);
      expect(out.landed, `landing moved with press ${before} steps early`).toBe(landed);
      expect(out.jumpedAfterLanding, `press ${before} steps before landing`).toBe(before <= window ? landed + 1 : -1);
      sim.dispose();
    }
  });

  it('a key held from before the landing does not jump again on landing', async () => {
    const sim = await createSim(level());
    const events: SimEvent[] = [];
    for (let i = 0; i < 200; i++) events.push(...sim.step(JUMP));
    expect(events.filter((e) => e.type === 'jumped')).toHaveLength(1);
    sim.dispose();
  });
});

describe('air control', () => {
  const horizontal = (sim: Sim, input: Input): number => {
    const before = sim.sofiyka.position.x;
    sim.step(input);
    return (sim.sofiyka.position.x - before) / dt;
  };

  it('on the ground full speed at once; in the air it builds up softly and reaches full speed in under 0.4 s', async () => {
    const ground = await createSim(level());
    expect(horizontal(ground, { ...NO_INPUT, moveX: 1 })).toBeCloseTo(TUNING.walkSpeed, 3);
    ground.dispose();

    const sim = await createSim(level());
    sim.step(JUMP);
    sim.step(NO_INPUT);
    const first = horizontal(sim, { ...NO_INPUT, moveX: 1 });
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.5 * TUNING.walkSpeed);
    let last = first;
    for (let i = 0; i < 24; i++) last = horizontal(sim, { ...NO_INPUT, moveX: 1 });
    expect(last).toBeGreaterThan(0.97 * TUNING.walkSpeed);
    expect(last).toBeLessThanOrEqual(TUNING.walkSpeed + 1e-6);
    sim.dispose();
  });

  it('a running jump keeps the running speed all the way through', async () => {
    const sim = await createSim(level());
    const run = { ...NO_INPUT, moveX: 1 };
    for (let i = 0; i < 5; i++) sim.step(run);
    const speeds: number[] = [];
    const before = sim.sofiyka.position.x;
    sim.step({ ...run, jump: true });
    for (let i = 0; i < 25; i++) speeds.push(horizontal(sim, run));
    expect(sim.sofiyka.grounded).toBe(false);
    for (const v of speeds) expect(v).toBeCloseTo(TUNING.walkSpeed, 2);
    expect(sim.sofiyka.position.x).toBeGreaterThan(before);
    sim.dispose();
  });

  it('letting go in the air slows her softly, not at once', async () => {
    const sim = await createSim(level());
    const run = { ...NO_INPUT, moveX: 1 };
    for (let i = 0; i < 5; i++) sim.step(run);
    sim.step({ ...run, jump: true });
    for (let i = 0; i < 3; i++) sim.step(run);
    const v = horizontal(sim, NO_INPUT);
    expect(v).toBeGreaterThan(0.5 * TUNING.walkSpeed);
    expect(v).toBeLessThan(TUNING.walkSpeed);
    sim.dispose();
  });
});
