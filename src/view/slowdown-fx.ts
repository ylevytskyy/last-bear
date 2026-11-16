export type SlowdownFx = {
  /** Наскільки холодніша картинка, 0..1. */
  tint: number;
  /** Наскільки темніші краї, 0..1. */
  vignette: number;
  /** Розмір піктограми «Shift» над Софійкою; 0 — не видно. */
  hintScale: number;
};

/** Вигляд Вікна: холодна картинка, темні краї, піктограма «Shift», що росте, коли часу мало. */
export function slowdownFx(open: boolean, remaining: number, slowdownSeconds: number): SlowdownFx {
  if (!open) return { tint: 0, vignette: 0, hintScale: 0 };
  const left = Math.min(1, Math.max(0, remaining / slowdownSeconds));
  return { tint: 0.6, vignette: 0.7, hintScale: 1 + 0.6 * (1 - left) };
}
