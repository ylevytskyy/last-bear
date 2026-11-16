import { describe, expect, it } from 'vitest';
import { sofiaClip, type SofiaMotion } from './sofia-clip';

const base: SofiaMotion = { grounded: true, running: false, airSeconds: 0, landedAgo: 99, unlockLeft: 0 };

describe('sofiaClip', () => {
  it('stands on Idle and runs on Run', () => {
    expect(sofiaClip(base)).toBe('Idle');
    expect(sofiaClip({ ...base, running: true })).toBe('Run');
  });

  it('starts a jump, then holds the air pose', () => {
    expect(sofiaClip({ ...base, grounded: false, airSeconds: 0.05 })).toBe('Jump_Start');
    expect(sofiaClip({ ...base, grounded: false, airSeconds: 0.6 })).toBe('Jump_Air');
  });

  it('plays Land right after touching down, before running again', () => {
    expect(sofiaClip({ ...base, running: true, landedAgo: 0.1 })).toBe('Land');
    expect(sofiaClip({ ...base, running: true, landedAgo: 0.5 })).toBe('Run');
  });

  it('plays Unlock_Cage while standing, but never in the air', () => {
    expect(sofiaClip({ ...base, unlockLeft: 1 })).toBe('Unlock_Cage');
    expect(sofiaClip({ ...base, grounded: false, airSeconds: 1, unlockLeft: 1 })).toBe('Jump_Air');
  });
});
