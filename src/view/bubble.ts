import type { BubblePicture } from './guide-fx';

/** Малюнки Бульбашки — SVG без тексту. */
const PICTURES: Record<BubblePicture, string> = {
  cage:
    '<rect x="14" y="12" width="36" height="38" rx="3" fill="none" stroke="#7a6a5a" stroke-width="4"/>' +
    '<path d="M23 12v38M32 12v38M41 12v38" stroke="#7a6a5a" stroke-width="3"/>' +
    '<circle cx="32" cy="33" r="7" fill="#9c9aa6"/><circle cx="27" cy="26" r="3" fill="#9c9aa6"/><circle cx="37" cy="26" r="3" fill="#9c9aa6"/>',
  key:
    '<circle cx="22" cy="32" r="10" fill="none" stroke="#e0a800" stroke-width="6"/>' +
    '<path d="M32 32h22M46 32v8M52 32v6" stroke="#e0a800" stroke-width="6" stroke-linecap="round"/>',
  flower:
    '<path d="M32 50v-14" stroke="#3f8f4a" stroke-width="4"/>' +
    '<g fill="#ffd22a"><circle cx="32" cy="18" r="8"/><circle cx="22" cy="26" r="8"/><circle cx="42" cy="26" r="8"/><circle cx="26" cy="36" r="7"/><circle cx="38" cy="36" r="7"/></g>' +
    '<circle cx="32" cy="28" r="6" fill="#ff8c1a"/>',
  heart: '<path d="M32 52s-16-9.5-20-19c-3-7 1-15 9-15 5 0 8 3 11 7 3-4 6-7 11-7 8 0 12 8 9 15-4 9.5-20 19-20 19z" fill="#ff3b5c"/>',
};

export type Bubble = {
  /** Хмаринка в точці екрана (px) з малюнком; `null` — сховати. */
  show(x: number, y: number, picture: BubblePicture | null): void;
  dispose(): void;
};

export function createBubble(root: HTMLElement): Bubble {
  const el = document.createElement('div');
  el.className = 'bubble';
  el.hidden = true;
  root.append(el);
  let current: BubblePicture | null = null;
  return {
    show(x, y, picture) {
      el.hidden = picture === null;
      if (picture === null) return;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      if (picture !== current) {
        current = picture;
        el.dataset['picture'] = picture;
        el.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true">${PICTURES[picture]}</svg>`;
      }
    },
    dispose() {
      el.remove();
    },
  };
}
