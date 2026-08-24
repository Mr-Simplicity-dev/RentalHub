import { interpolate, Easing } from 'remotion';

// ── Easing curves (the motion design language) ──────────────────────────
// Every animation in the ads must use one of these named curves. Never use
// plain linear interpolation.

export const ease = {
  // Fast start, long luxurious settle. Brand frames, photo pushes.
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),

  // Overshoots ~7% past the target then settles. Punch lines, key words.
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },

  // Smooth and neutral. Dissolves and camera moves.
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),

  // Mechanical, comedic overshoot for the joy ad.
  springLike: (t: number) => {
    const c1 = 2.2;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

// Convenience wrappers so slides don't import remotion's Easing directly.
export const EXPO_OUT = ease.outExpo;
export const BACK_OUT = ease.outBack;
export const CUBIC_IN_OUT = ease.inOutCubic;
export const SPRING_OUT = ease.springLike;

// Remotion's interpolate already accepts easing functions of this shape.
export const EASINGS = {
  outExpo: ease.outExpo,
  outBack: ease.outBack,
  inOutCubic: ease.inOutCubic,
  springLike: ease.springLike,
} as const;

export type EasingName = keyof typeof EASINGS;

export { interpolate, Easing };
