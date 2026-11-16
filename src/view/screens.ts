export type Screens = {
  /** Заставка з назвою; зникає з першого натиску. */
  showSplash(onStart: () => void): void;
  /** «Далі буде» поверх гри. */
  showToBeContinued(): void;
  dispose(): void;
};

/** Слова гри — лише тут: назва на заставці й «Далі буде» в кінці. */
export function createScreens(root: HTMLElement): Screens {
  const splash = document.createElement('div');
  splash.className = 'screen splash';
  splash.hidden = true;
  splash.innerHTML =
    '<h1>Останній ведмідь</h1>' +
    '<svg class="screen-key" viewBox="0 0 120 64" aria-hidden="true"><rect x="4" y="8" width="112" height="48" rx="10" fill="#f4f1ea" stroke="#3a3a44" stroke-width="4"/>' +
    '<path d="M44 32h32M64 22l12 10-12 10" stroke="#3a3a44" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const end = document.createElement('div');
  end.className = 'screen the-end';
  end.hidden = true;
  end.innerHTML = '<h1>Далі буде</h1>';
  root.append(splash, end);
  let cleanup: (() => void) | null = null;
  return {
    showSplash(onStart) {
      splash.hidden = false;
      const start = () => {
        splash.hidden = true;
        cleanup?.();
        cleanup = null;
        onStart();
      };
      window.addEventListener('keydown', start);
      window.addEventListener('mousedown', start);
      cleanup = () => {
        window.removeEventListener('keydown', start);
        window.removeEventListener('mousedown', start);
      };
    },
    showToBeContinued() {
      end.hidden = false;
    },
    dispose() {
      cleanup?.();
      splash.remove();
      end.remove();
    },
  };
}
