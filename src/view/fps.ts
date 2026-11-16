/** Лічильник кадрів за останню секунду (dev-інструмент). */
export function fpsMeter(): { tick(nowMs: number): void; fps(): number } {
  const stamps: number[] = [];
  return {
    tick(nowMs) {
      stamps.push(nowMs);
      while (stamps.length > 0 && stamps[0]! < nowMs - 1000) stamps.shift();
    },
    fps() {
      if (stamps.length < 2) return 0;
      const span = stamps[stamps.length - 1]! - stamps[0]!;
      return span > 0 ? ((stamps.length - 1) * 1000) / span : 0;
    },
  };
}
