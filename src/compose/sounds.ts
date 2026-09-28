export const SOUNDS = ['click', 'keys', 'draw', 'pop', 'whoosh', 'swipe', 'scroll'] as const;
export type Sound = (typeof SOUNDS)[number];
