import { heartsLayout } from './hud-model';

const HEART_PATH = 'M12 21s-7.5-4.6-9.6-9.2C.9 8.5 2.8 4.5 6.6 4.5c2.2 0 3.6 1.2 5.4 3.2 1.8-2 3.2-3.2 5.4-3.2 3.8 0 5.7 4 4.2 7.3C19.5 16.4 12 21 12 21z';
const SVG_NS = 'http://www.w3.org/2000/svg';

export type Hud = {
  update(hearts: number, maxHearts: number): void;
  /** Червона рамка екрана, 0..1. */
  flash(strength: number): void;
  /** Піктограма «Shift» у точці екрана (px); `scale` 0 — сховати. */
  hint(x: number, y: number, scale: number): void;
  dispose(): void;
};

/** Панель Сердець у куті і червона рамка; жодного тексту. */
export function createHud(root: HTMLElement): Hud {
  const panel = document.createElement('div');
  panel.className = 'hud-hearts';
  const frame = document.createElement('div');
  frame.className = 'hud-hurt';
  const hintIcon = document.createElement('div');
  hintIcon.className = 'hud-hint';
  // Клавіша зі стрілкою вгору — знак Shift без літер.
  hintIcon.innerHTML =
    '<svg viewBox="0 0 56 56" aria-hidden="true"><rect x="3" y="3" width="50" height="50" rx="10" fill="rgba(20,24,40,.8)" stroke="#9fd8ff" stroke-width="3"/>' +
    '<path d="M28 12 L44 30 H35 V44 H21 V30 H12 Z" fill="#9fd8ff"/></svg>';
  root.append(panel, frame, hintIcon);
  const icons: SVGSVGElement[] = [];
  let last = '';

  return {
    update(hearts, maxHearts) {
      const layout = heartsLayout(hearts, maxHearts);
      const key = layout.join();
      if (key === last) return;
      last = key;
      while (icons.length < layout.length) {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', HEART_PATH);
        svg.append(path);
        panel.append(svg);
        icons.push(svg);
      }
      while (icons.length > layout.length) icons.pop()?.remove();
      layout.forEach((state, i) => icons[i]!.setAttribute('class', `heart heart-${state}`));
    },
    flash(strength) {
      frame.style.opacity = String(Math.max(0, Math.min(1, strength)));
    },
    hint(x, y, scale) {
      hintIcon.style.opacity = scale > 0 ? '1' : '0';
      hintIcon.style.left = `${x}px`;
      hintIcon.style.top = `${y}px`;
      hintIcon.style.transform = `scale(${Math.max(0, scale)})`;
    },
    dispose() {
      hintIcon.remove();
      panel.remove();
      frame.remove();
    },
  };
}
