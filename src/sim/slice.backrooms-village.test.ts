import { describe, expect, it } from 'vitest';
import { WORLDS } from '../levels/worlds';
import { createGame, type GameEvent } from './game';
import { NO_INPUT } from './input';
import { createSliceBot, playScenario } from './scenario';
import { TUNING } from './tuning';

const entered = (events: GameEvent[]) => events.filter((e) => e.type === 'worldEntered');

describe('the slice bot: Backrooms, then the Village, to the doorstep of the Honeycombs', () => {
  it('walks Backrooms → Village → Honeycombs in 5400 steps and loses no heart', { timeout: 120_000 }, async () => {
    const game = await createGame(WORLDS, TUNING);
    const bot = createSliceBot(WORLDS);
    const { events, steps } = playScenario(game, bot, 5400, (e) => e.some((x) => x.type === 'worldEntered' && x.world === 'honeycombs'));
    expect(entered(events)).toEqual([
      { type: 'worldEntered', world: 'village', from: 'backrooms' },
      { type: 'worldEntered', world: 'honeycombs', from: 'village' },
    ]);
    expect(steps).toBeLessThan(5400);
    expect(events.filter((e) => e.type === 'heartLost')).toEqual([]);
    expect(game.world).toBe('honeycombs');
    game.dispose();
  });

  it('through the Backrooms it follows the route: bars crossed with Blink, the ledge with a double jump', { timeout: 120_000 }, async () => {
    const game = await createGame(WORLDS, TUNING);
    const { events } = playScenario(game, createSliceBot(WORLDS), 1800, (e) => e.some((x) => x.type === 'worldLeft'));
    expect(events.filter((e) => e.type === 'blinked')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'jumped' && e.double)).toHaveLength(1);
    expect(events.find((e) => e.type === 'worldLeft')).toEqual({ type: 'worldLeft', from: 'backrooms', to: 'village', color: expect.any(String) });
    game.dispose();
  });

  it('without an `until`, a game plays until the slice is complete or the steps run out', { timeout: 60_000 }, async () => {
    const game = await createGame(WORLDS, TUNING);
    const { steps } = playScenario(game, () => NO_INPUT, 120);
    expect(steps).toBe(120);
    expect(game.complete).toBe(false);
    game.dispose();
  });

  it('in the Village with a key, without an `until`, it stops by itself when the cage is open', { timeout: 60_000 }, async () => {
    const game = await createGame(WORLDS, TUNING, { world: 'village', keys: 1, from: 'honeycombs' });
    const { events, steps } = playScenario(game, createSliceBot(WORLDS), 3000);
    expect(game.complete).toBe(true);
    expect(steps).toBeLessThan(3000);
    expect(events[events.length - 1]).toEqual({ type: 'sliceComplete' });
    game.dispose();
  });
});
