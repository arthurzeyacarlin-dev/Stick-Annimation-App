// SPEC-0017: stick figure colors (Arthur, 2026-10-04: "a red stick figure doing this, a green one doing
// that"). Each figure has its own color (CharacterStyle.color). The AI Animator will turn a color word
// into one of these; anyone can also pick one by hand. All are easy to see on the white page.
export const FIGURE_COLORS = {
  black: "#111111",
  red: "#e02424",
  orange: "#f97316",
  yellow: "#d9a400",
  green: "#16a34a",
  blue: "#2563eb",
  purple: "#7c3aed",
  pink: "#ec4899",
  brown: "#8b5a2b",
  gray: "#6b7280",
} as const;
export type FigureColorName = keyof typeof FIGURE_COLORS;
export const FIGURE_COLOR_NAMES = Object.keys(FIGURE_COLORS) as FigureColorName[];

// A color word ("Red", "grey") or a #rgb / #rrggbb code → the color to draw with (null if unknown).
export function figureColor(word: string): string | null {
  const w = word.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(w)) return w;
  const name = (w === "grey" ? "gray" : w) as FigureColorName;
  return FIGURE_COLORS[name] ?? null;
}
