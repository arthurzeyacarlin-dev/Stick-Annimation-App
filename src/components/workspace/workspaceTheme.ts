// Editor palette shared by the drawing workspace chrome. Matches Home/Help/Assistant.
// SPEC-0020 Phase 3: values are the shared --da-* tokens (same colors as fallbacks) so Settings → Appearance
// (Dark / Bright, accent color) reaches the editor and the AI Animator panel too.
// Hover (#0066FF fill, white text) is applied by workspaceTheme.module.css, not inline styles.
export const workspaceColors = {
  page: "var(--da-page, #030914)", // darkest background
  chrome: "var(--da-panel, #071120)", // top bar, timeline, side panel, AI panel, tool bar backgrounds
  stage: "var(--da-page, #030914)", // dark work areas: canvas surround and AI chat section
  panel: "var(--da-panel, #071120)", // buttons and pop-up menus at rest
  inset: "var(--da-page, #030914)", // dark wells for inputs/cards inside the brighter chrome panels
  chatBox: "var(--da-panel, #071120)", // brighter chat box on the dark AI section (matches the Assistant)
  chatBoxBorder: "var(--da-border, #244267)",
  divider: "var(--da-line, #163058)", // hairlines between areas
  border: "var(--da-border, #244267)", // button/card borders at rest
  selectedFill: "var(--da-selected-bg, #0f2a52)", // dull blue: current tool, active tab, current frame, toggle on
  selectedBorder: "var(--da-selected-border, #3a6aa3)",
  hover: "var(--da-hover, #0066ff)", // bright blue, hover only
  textPrimary: "var(--da-text, #f6f9ff)",
  textSecondary: "var(--da-text-2, #c9d6ea)",
  textMuted: "var(--da-muted, #8fabd0)",
  label: "var(--da-label, #7895bc)", // small uppercase labels
  accentMuted: "var(--da-link, #8cbbf3)", // dull blue accent text
  iconMuted: "var(--da-icon, #7296bd)",
  danger: "var(--da-danger, #ff8a95)",
} as const;
