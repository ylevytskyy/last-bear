export type InputLatch = {
  press(code: string): void;
  release(code: string): void;
  /** Натиснуті зараз плюс ті, що натиснули й відпустили після останнього `consumed()`. */
  snapshot(): ReadonlySet<string>;
  /** Кроки правил побачили знімок: короткі натиски вже враховано. */
  consumed(): void;
  clear(): void;
};

/**
 * Клавіші для кроків правил. У Вікні кроків лише ~12 за секунду, тож короткий тап між двома
 * кроками інакше загубився б.
 */
export function createInputLatch(): InputLatch {
  const held = new Set<string>();
  const tapped = new Set<string>();
  return {
    press(code) {
      held.add(code);
      tapped.add(code);
    },
    release(code) {
      held.delete(code);
    },
    snapshot() {
      return new Set([...held, ...tapped]);
    },
    consumed() {
      tapped.clear();
    },
    clear() {
      held.clear();
      tapped.clear();
    },
  };
}
