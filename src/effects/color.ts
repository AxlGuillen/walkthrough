// Text laid on an accent fill: white, unless the accent is light (lime, yellow, cyan), where
// white disappears. By raw WCAG ratio a saturated red would get dark text too, by a hair,
// yet white reads better there, so the switch sits at a clearly light luminance.
export function onAccent(accent: string): string {
  const luminance = relativeLuminance(accent);
  return luminance !== null && luminance > LIGHT ? '#111111' : '#ffffff';
}

const LIGHT = 0.4;

function relativeLuminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(match[1]!.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
