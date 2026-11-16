import { describe, expect, it } from 'vitest';
import { HONEYCOMBS } from '../levels/honeycombs';
import { WORLDS } from '../levels/worlds';
import { createGame, type Game, type GameEvent } from './game';
import { NO_INPUT } from './input';
import { createSliceBot, playScenario, type Bot } from './scenario';
import { TUNING } from './tuning';

/** 7 хвилин ігрового часу, кроків по 1/60 с. */
const SEVEN_MINUTES = 25_200;
const index = (events: GameEvent[], pick: (e: GameEvent) => boolean, from = 0) => {
  const i = events.slice(from).findIndex(pick);
  return i < 0 ? -1 : i + from;
};

describe('the playthrough: the whole slice, Backrooms to the open cage, with no browser', () => {
  it('is complete in under seven minutes of game time and no heart is lost, through Village, Honeycombs, Village', { timeout: 300_000 }, async () => {
    const game = await createGame(WORLDS, TUNING);
    const { events, steps } = playScenario(game, createSliceBot(WORLDS), SEVEN_MINUTES);
    expect(game.complete).toBe(true);
    expect(events.filter((e) => e.type === 'sliceComplete')).toHaveLength(1);
    expect(steps).toBeLessThan(SEVEN_MINUTES);
    expect(events.filter((e) => e.type === 'heartLost')).toEqual([]);
    expect(events.filter((e) => e.type === 'worldEntered').map((e) => (e as { world: string }).world)).toEqual(['village', 'honeycombs', 'village']);
    expect(events.filter((e) => e.type === 'keyPicked')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'cageOpened')).toHaveLength(1);
    expect(events[events.length - 1]).toEqual({ type: 'sliceComplete' });
    expect(game.sim.sofiyka.hearts).toBe(TUNING.hearts);
    expect(game.sim.sofiyka.keys).toBe(0); // Ключ витрачено на Клітку
    game.dispose();
  });

  it('a sleeper after the key: the bees hit her, and at no hearts she is back at the Honeycombs entry with the key', { timeout: 300_000 }, async () => {
    const game: Game = await createGame(WORLDS, TUNING, { world: 'honeycombs', from: 'village' });
    const slice = createSliceBot(WORLDS);
    let asleep = false;
    const bot: Bot<Game> = (g, i, last) => {
      if (last.some((e) => e.type === 'keyPicked')) asleep = true;
      return asleep ? NO_INPUT : slice(g, i, last);
    };
    const { events, steps } = playScenario(game, bot, 6000, (e) => e.some((x) => x.type === 'respawned'));
    expect(steps).toBeLessThan(6000);
    const key = index(events, (e) => e.type === 'keyPicked');
    expect(key).toBeGreaterThanOrEqual(0);
    // До ключа — жодного Серця; потім перша шкода — із Вікна, яке минуло без Рефлексу.
    expect(index(events, (e) => e.type === 'heartLost')).toBeGreaterThan(key);
    const opened = index(events, (e) => e.type === 'windowOpened', key);
    const closed = index(events, (e) => e.type === 'windowClosed' && !e.reflexed, opened);
    const lost = index(events, (e) => e.type === 'heartLost' && e.cause === 'hit', closed);
    expect(opened).toBeGreaterThan(key);
    expect(closed).toBeGreaterThan(opened);
    expect(lost).toBeGreaterThan(closed);
    expect(events.filter((e) => e.type === 'reflexed' && events.indexOf(e) > key)).toEqual([]);
    expect(events.filter((e) => e.type === 'heartLost')).toHaveLength(TUNING.hearts);
    // Відродження: на вході Стільників, п'ять Сердець, Ключ лишився.
    expect(events[events.length - 1]).toEqual({ type: 'respawned' });
    expect(game.world).toBe('honeycombs');
    expect(game.sim.sofiyka.position).toEqual(HONEYCOMBS.entries!.village);
    expect(game.sim.sofiyka.hearts).toBe(TUNING.hearts);
    expect(game.sim.sofiyka.keys).toBe(1);
    expect(game.sim.source).toMatchObject({ broken: true, keyAt: null });
    game.dispose();
  });
});
