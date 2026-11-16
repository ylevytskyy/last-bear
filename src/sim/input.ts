/**
 * moveX/moveZ — напрямок у світі, -1..1. jump/blink/strike — «клавіша зараз натиснута»;
 * фронт натиску визначають правила.
 */
export type Input = { moveX: number; moveZ: number; jump: boolean; blink: boolean; strike: boolean };

export const NO_INPUT: Input = { moveX: 0, moveZ: 0, jump: false, blink: false, strike: false };
