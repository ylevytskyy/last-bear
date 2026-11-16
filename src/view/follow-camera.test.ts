import { describe, expect, it } from 'vitest';
import type { Input } from '../sim/input';
import { TUNING } from '../sim/tuning';
import { cameraHeading, followCamera, orbitCamera, type CameraPose } from './follow-camera';

const open = (_from: unknown, _dir: unknown, max: number) => max;
const origin = { x: 0, y: 0, z: 0 };
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function run(pose: CameraPose, seconds: number, facing: number, clear = open): CameraPose {
  for (let i = 0; i < Math.round(seconds * 60); i++) pose = followCamera(pose, origin, facing, 1 / 60, clear);
  return pose;
}

describe('followCamera', () => {
  const start: CameraPose = { position: { x: 9, y: 9, z: 9 }, lookAt: origin, yaw: 0 };

  it('sits behind and above Sofiyka and looks at her', () => {
    const pose = run(start, 2, 0);
    expect(pose.position.z).toBeLessThan(-1);
    expect(Math.abs(pose.position.x)).toBeLessThan(0.01);
    expect(pose.position.y).toBeGreaterThan(pose.lookAt.y);
    expect(dist(pose.lookAt, origin)).toBeLessThan(1.5);
  });

  it('comes closer when the view is blocked', () => {
    const pose = run(start, 2, 0, (_f, _d, max) => Math.min(max, 1.5));
    expect(dist(pose.position, pose.lookAt)).toBeLessThanOrEqual(1.5);
  });

  it('turns most of the way in 0.5 s after a 180 degree turn, never jumping in one frame', () => {
    let pose = start;
    let last = pose.yaw;
    for (let i = 0; i < 30; i++) {
      pose = followCamera(pose, origin, Math.PI, 1 / 60, open);
      expect(Math.abs(wrap(pose.yaw - last))).toBeLessThan(Math.PI / 4);
      last = pose.yaw;
    }
    expect(Math.abs(wrap(Math.PI - pose.yaw))).toBeLessThanOrEqual(0.2 * Math.PI);
  });
});

describe('cameraHeading', () => {
  const input = (moveX: number, moveZ: number): Input => ({ moveX, moveZ, jump: false, blink: false, strike: false });

  it('follows facing while walking away from the camera', () => {
    expect(cameraHeading(input(0, 1), 0, 0.5)).toBe(0.5);
  });

  it('holds the camera when walking towards it, sideways, or standing', () => {
    expect(cameraHeading(input(0, -1), 0, Math.PI)).toBe(0);
    expect(cameraHeading(input(1, 0), 0, Math.PI / 2)).toBe(0);
    expect(cameraHeading(input(0, 0), 0.3, 0)).toBe(0.3);
  });
});

describe('followCamera with a heading override (after a Reflex)', () => {
  const open = (_f: unknown, _d: unknown, max: number) => max;
  const start = { position: { x: 0, y: 3.5, z: -6 }, lookAt: { x: 0, y: 1, z: 0 }, yaw: 0 };
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

  it('turns at least 80% of a half turn in 0.5 s, never more than a quarter turn in one frame', () => {
    let pose = start;
    let turned = 0;
    for (let i = 0; i < 30; i++) {
      // Погляд Софійки лишився 0, але камера йде за напрямком Рефлексу.
      const next = followCamera(pose, { x: 0, y: 0, z: 0 }, 0, 1 / 60, open, TUNING, Math.PI - 1e-6);
      const step = Math.abs(wrap(next.yaw - pose.yaw));
      expect(step).toBeLessThanOrEqual(Math.PI / 2);
      turned += step;
      pose = next;
    }
    expect(turned).toBeGreaterThanOrEqual(0.8 * Math.PI);
  });

  it('even a long frame turns no more than a quarter turn', () => {
    const next = followCamera(start, { x: 0, y: 0, z: 0 }, 0, 0.25, open, TUNING, Math.PI - 1e-6);
    expect(Math.abs(wrap(next.yaw - start.yaw))).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
  });
});

describe('orbitCamera (mouse-look)', () => {
  const open = (_f: unknown, _d: unknown, max: number) => max;
  const target = { x: 0, y: 0, z: 0 };

  it('sits behind along the yaw, above by the pitch, at camera distance, and looks at her', () => {
    const pose = orbitCamera(target, { yaw: 0, pitch: 0.5 }, open);
    const look = pose.lookAt;
    expect(look).toEqual({ x: 0, y: TUNING.cameraLookHeight, z: 0 });
    const d = Math.hypot(pose.position.x - look.x, pose.position.y - look.y, pose.position.z - look.z);
    expect(d).toBeCloseTo(TUNING.cameraDistance, 6);
    expect(pose.position.z).toBeLessThan(0); // позаду, коли дивиться вздовж +z
    expect(pose.position.y - look.y).toBeCloseTo(TUNING.cameraDistance * Math.sin(0.5), 6);
    expect(pose.yaw).toBe(0);
  });

  it('turning the yaw by 90° puts the camera on the other side', () => {
    const pose = orbitCamera(target, { yaw: Math.PI / 2, pitch: 0.3 }, open);
    expect(pose.position.x).toBeLessThan(-1);
    expect(Math.abs(pose.position.z)).toBeLessThan(1e-6);
  });

  it('comes in front of a wall instead of going through it', () => {
    const wall = (_f: unknown, _d: unknown, max: number) => Math.min(max, 2);
    const pose = orbitCamera(target, { yaw: 0, pitch: 0.4 }, wall);
    const d = Math.hypot(pose.position.x - pose.lookAt.x, pose.position.y - pose.lookAt.y, pose.position.z - pose.lookAt.z);
    expect(d).toBeLessThan(2);
  });
});
