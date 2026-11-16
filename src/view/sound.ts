export type Sound = {
  whoosh(): void;
  /** Короткий металевий «дзень»: Удар по невразливому ворогу. */
  clink(): void;
  /** Викликається першим натиском клавіші: браузер дозволяє звук лише після дії користувача. */
  resume(): void;
  state(): AudioContextState | 'none';
};

/** Звук синтезується: файлів немає. «Вжух» — шум через смуговий фільтр, що злітає вгору. */
export function createSound(): Sound {
  let ctx: AudioContext | null = null;
  let noise: AudioBuffer | null = null;

  function context(): AudioContext {
    if (!ctx) {
      ctx = new AudioContext();
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return ctx;
  }

  return {
    resume() {
      void context().resume();
    },
    whoosh() {
      const c = context();
      if (!noise) return;
      const now = c.currentTime;
      const source = c.createBufferSource();
      source.buffer = noise;
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.2;
      filter.frequency.setValueAtTime(300, now);
      filter.frequency.exponentialRampToValueAtTime(3000, now + 0.22);
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.35, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      source.connect(filter).connect(gain).connect(c.destination);
      source.start(now);
      source.stop(now + 0.32);
    },
    clink() {
      const c = context();
      const now = c.currentTime;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      gain.connect(c.destination);
      // Два негармонійні тони звучать як метал.
      for (const f of [1760, 2637]) {
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    },
    state() {
      return ctx ? ctx.state : 'none';
    },
  };
}
