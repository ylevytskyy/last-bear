import type { SimEvent } from '../sim/sim';

export type HitFx = { burst: 'smoke' | 'dust' | 'none'; flash: boolean; sound: 'whoosh' | 'clink' | 'none' };

const NOTHING: HitFx = { burst: 'none', flash: false, sound: 'none' };

/**
 * Відгук на подію. `struck{hit}` — спалах ворога і пил; `struck` по невразливому — «дзень» без частинок;
 * `enemyDefeated` — хмарка диму; `heartLost` — спалах рамки (S15).
 */
export function hitFxFor(event: SimEvent): HitFx {
  switch (event.type) {
    case 'struck':
      if (event.hit) return { burst: 'dust', flash: true, sound: 'none' };
      return event.enemyId === null ? NOTHING : { burst: 'none', flash: false, sound: 'clink' };
    case 'enemyDefeated':
      return { burst: 'smoke', flash: false, sound: 'whoosh' };
    case 'heartLost':
      return { burst: 'none', flash: true, sound: 'none' };
    default:
      return NOTHING;
  }
}
