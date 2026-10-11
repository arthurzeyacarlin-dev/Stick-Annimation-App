// SPEC-0020 Phase 3: Appearance (theme + accent) is applied as <html data-theme data-accent>. A cookie keeps the
// last choice so the server can render the right look on the first paint (no dark→bright flash).
export const APPEARANCE_COOKIE = "da-appearance";
const THEMES = ["dark", "light"] as const;
const ACCENTS = ["blue", "purple", "green", "orange", "pink", "red", "teal"] as const;

export type Appearance = { theme: (typeof THEMES)[number]; accent: (typeof ACCENTS)[number] };

export function parseAppearanceCookie(value: string | undefined | null): Appearance {
  const [theme, accent] = (value ?? "").split(".");
  return {
    theme: (THEMES as readonly string[]).includes(theme) ? theme as Appearance["theme"] : "dark",
    accent: (ACCENTS as readonly string[]).includes(accent) ? accent as Appearance["accent"] : "blue",
  };
}

export const appearanceCookieValue = (appearance: Appearance) => `${appearance.theme}.${appearance.accent}`;
