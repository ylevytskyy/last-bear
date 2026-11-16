import { describe, expect, it } from 'vitest';
import { WORLDS } from '../levels/worlds';
import { createGame } from './game';
import { NO_INPUT } from './input';
import { createSliceBot, playScenario } from './scenario';
import { TUNING } from './tuning';

describe('the slice bot in the Honeycombs, with the real bees', () => {
  // Нуль, 37 і 113 кроків очікування на вході: інша фаза рухомих платформ і Бджіл.
  it.each([0, 37, 113])('takes the key and flies back to the Village without losing a heart (waited %i steps at the entry)', { timeout: 120_000 }, async (wait) => {
    const game = await createGame(WORLDS, TUNING, { world: 'honeycombs', from: 'village' });
    for (let i = 0; i < wait; i++) game.step(NO_INPUT);
    const { events, steps } = playScenario(game, createSliceBot(WORLDS), 9000, (e) => e.some((x) => x.type === 'worldEntered' && x.world === 'village'));
    expect(events.filter((e) => e.type === 'heartLost')).toEqual([]);
    expect(events.filter((e) => e.type === 'keyPicked')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'worldEntered')).toEqual([{ type: 'worldEntered', world: 'village', from: 'honeycombs' }]);
    expect(steps).toBeLessThan(9000);
    expect(game.world).toBe('village');
    expect(game.sim.sofiyka.keys).toBe(1);
    game.dispose();
  });

  it('the bees are real: a bot that ignores the slowdown loses a heart on the same road', { timeout: 120_000 }, async () => {
    const game = await createGame(WORLDS, TUNING, { world: 'honeycombs', from: 'village' });
    const bot = createSliceBot(WORLDS);
    // Той самий бот, але Shift у Вікні не тисне й не б'є ворогів: бачить лише стан без Вікна.
    const blind = (g: typeof game, i: number, last: Parameters<typeof bot>[2]) => {
      const input = bot(g, i, last);
      return g.sim.slowdown.open || g.sim.sofiyka.mode === 'ATTACK' ? { ...input, blink: false, strike: false } : { ...input, blink: input.blink && !g.sim.slowdown.open };
    };
    const { events } = playScenario(game, blind, 9000, (e) => e.some((x) => x.type === 'worldEntered' && x.world === 'village'));
    expect(events.some((e) => e.type === 'heartLost')).toBe(true);
    game.dispose();
  });

  it('while the slowdown is open she stands still: no jump and no step while Shift finds no place behind the bee', { timeout: 120_000 }, async () => {
    const game = await createGame(WORLDS, TUNING, { world: 'honeycombs', from: 'village' });
    const bot = createSliceBot(WORLDS);
    let last: ReturnType<typeof game.step> = [];
    let checked = 0;
    for (let i = 0; i < 9000 && game.world === 'honeycombs'; i++) {
      const input = bot(game, i, last.filter((e) => e.type !== 'worldLeft' && e.type !== 'worldEntered') as never);
      if (game.sim.slowdown.open) {
        expect(input.jump).toBe(false);
        expect(input.moveX).toBe(0);
        expect(input.moveZ).toBe(0);
        checked++;
      }
      last = game.step(input);
    }
    expect(checked).toBeGreaterThan(0);
    game.dispose();
  });
});
