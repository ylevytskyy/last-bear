import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../level';
import { TUNING } from '../tuning';
import { createTurtle, stepTurtle, type TurtleGround, type TurtleInternal } from './turtle';

const DT = TUNING.step;
/** Нескінченна рівна підлога на y = 0, без стін. */
const FLAT: TurtleGround = { rayDown: (from) => from.y, rayDistance: (_f, _d, max) => max };

function run(turtle: TurtleInternal, target: Vec3, seconds: number, ground = FLAT) {
  const events: string[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const r = stepTurtle(turtle, target, DT, ground, TUNING);
    turtle = r.turtle;
    events.push(...r.events);
  }
  return { turtle, events };
}

describe('Turtle state machine', () => {
  it('stands while Sofiyka is beyond the aggro radius', () => {
    const { turtle } = run(createTurtle('t', { x: 0, y: 0, z: 0 }, 0), { x: 0, y: 0, z: 9 }, 1);
    expect(turtle.state).toBe('WALK');
    expect(turtle.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('walks toward her at walk speed and turns to face her', () => {
    const { turtle } = run(createTurtle('t', { x: 0, y: 0, z: 0 }, Math.PI), { x: 7, y: 0, z: 0 }, 1);
    expect(turtle.position.x).toBeCloseTo(TUNING.turtle.walkSpeed, 2);
    expect(turtle.facing).toBeCloseTo(Math.PI / 2, 5);
  });

  it('winds up inside attack range, spins, cools down, walks; facing frozen from the windup on', () => {
    let { turtle, events } = run(createTurtle('t', { x: 0, y: 0, z: 0 }, 0), { x: 0, y: 0, z: 2 }, DT);
    expect(turtle.state).toBe('WINDUP');
    expect(events).toEqual(['windupStarted']);
    const facing = turtle.facing;
    const side = { x: 2, y: 0, z: 0 }; // вона забігла вбік
    ({ turtle, events } = run(turtle, side, TUNING.turtle.windupSeconds));
    expect(turtle.state).toBe('SPIN');
    expect(events).toEqual(['spinStarted']);
    ({ turtle, events } = run(turtle, side, TUNING.turtle.spinSeconds));
    expect(turtle.state).toBe('COOLDOWN');
    expect(events).toEqual(['spinEnded']);
    expect(turtle.facing).toBe(facing);
    ({ turtle } = run(turtle, side, TUNING.turtle.cooldownSeconds - 2 * DT));
    expect(turtle.state).toBe('COOLDOWN');
    expect(turtle.facing).toBe(facing);
    ({ turtle } = run(turtle, side, 3 * DT));
    expect(turtle.state).not.toBe('COOLDOWN');
  });

  it('does not step off an edge', () => {
    // Земля лише там, де x < 3.
    const edge: TurtleGround = { rayDown: (from, max) => (from.x < 3 ? from.y : max), rayDistance: (_f, _d, max) => max };
    const { turtle } = run(createTurtle('t', { x: 0, y: 0, z: 0 }, 0), { x: 7.5, y: 0, z: 0 }, 5, edge);
    expect(turtle.position.x).toBeLessThan(3);
    expect(turtle.position.x).toBeGreaterThan(3 - TUNING.turtle.radius - 0.1);
  });

  it('does not walk into a wall', () => {
    const wall: TurtleGround = { rayDown: (from) => from.y, rayDistance: (from, dir, max) => (dir.x > 0 ? Math.min(max, 2 - from.x) : max) };
    const { turtle } = run(createTurtle('t', { x: 0, y: 0, z: 0 }, 0), { x: 7.5, y: 0, z: 0 }, 5, wall);
    expect(turtle.position.x).toBeLessThanOrEqual(2 - TUNING.turtle.radius + 1e-6);
    expect(turtle.position.x).toBeGreaterThan(2 - TUNING.turtle.radius - 0.1);
  });
});
