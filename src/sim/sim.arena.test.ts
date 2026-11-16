import { describe, expect, it } from 'vitest';
import { ARENA } from '../levels/arena';
import { NO_INPUT } from './input';
import { childBot, playScenario, sleeperBot, type Bot } from './scenario';
import { createSim, type SimEvent } from './sim';
import { TUNING } from './tuning';

const types = (events: SimEvent[]) => events.map((e) => e.type);

describe('arena run-through (Проходження)', () => {
  it('the child bot defeats all three enemies without losing a heart, within 3000 steps', async () => {
    const sim = await createSim(ARENA);
    const run = playScenario(sim, childBot, 3000);
    const defeated = run.events.filter((e) => e.type === 'enemyDefeated').map((e) => (e.type === 'enemyDefeated' ? e.id : ''));
    expect(new Set(defeated)).toEqual(new Set(ARENA.enemies!.map((e) => e.id)));
    expect(sim.enemies).toHaveLength(0);
    expect(sim.sofiyka.hearts).toBe(5);
    expect(run.steps).toBeLessThanOrEqual(3000);
    expect(types(run.events)).toContain('reflexed');
    sim.dispose();
  });

  it('the sleeper bot sees a Window open and close, then loses a heart to the hit', async () => {
    const sim = await createSim(ARENA);
    const t = types(playScenario(sim, sleeperBot, 600).events);
    const opened = t.indexOf('windowOpened');
    expect(opened).toBeGreaterThanOrEqual(0);
    const closed = t.indexOf('windowClosed', opened);
    expect(closed).toBeGreaterThan(opened);
    const lost = t.indexOf('heartLost', closed);
    expect(lost).toBeGreaterThan(closed);
    sim.dispose();
  });

  it('given time, the sleeper bot respawns with five hearts and every enemy back home, full', async () => {
    const sim = await createSim(ARENA);
    let respawnStep = -1;
    const bot: Bot = (s, i, last) => {
      if (respawnStep < 0 && last.some((e) => e.type === 'respawned')) respawnStep = i;
      return sleeperBot(s, i, last);
    };
    for (let i = 0; i < 20000 && respawnStep < 0; i++) {
      const events = sim.step(bot(sim, i, []));
      if (events.some((e) => e.type === 'respawned')) {
        respawnStep = i;
        expect(sim.sofiyka.hearts).toBe(TUNING.hearts);
        expect(sim.enemies.map((e) => e.id).sort()).toEqual(ARENA.enemies!.map((e) => e.id).sort());
        for (const spawn of ARENA.enemies!) {
          const e = sim.enemies.find((x) => x.id === spawn.id)!;
          expect(e.position).toEqual(spawn.position);
          expect(e.hp).toBe(TUNING.hitsToDefeat[e.kind]);
        }
      }
    }
    expect(respawnStep).toBeGreaterThan(0);
    sim.dispose();
  });

  // Бот-«дитина» б'є спершу Черепаху, а обидві Бджоли — одним Ударом; тож перевіряємо першого переможеного ворога.
  it('an enemy the child defeated is back after the sleeper lets her respawn', async () => {
    const sim = await createSim(ARENA);
    let firstDefeat: string | null = null;
    const bot: Bot = (s, i, last) => {
      for (const e of last) if (!firstDefeat && e.type === 'enemyDefeated') firstDefeat = e.id;
      return firstDefeat ? sleeperBot(s, i, last) : childBot(s, i, last);
    };
    let respawned = false;
    let last: SimEvent[] = [];
    for (let i = 0; i < 20000 && !respawned; i++) {
      last = sim.step(bot(sim, i, last));
      respawned = last.some((e) => e.type === 'respawned');
    }
    expect(firstDefeat).not.toBeNull();
    expect(respawned).toBe(true);
    expect(sim.enemies.some((e) => e.id === firstDefeat)).toBe(true);
    sim.dispose();
  });

  it('NO_INPUT is what the sleeper sends', () => {
    expect(sleeperBot(undefined as never, 0, [])).toEqual(NO_INPUT);
  });
});
