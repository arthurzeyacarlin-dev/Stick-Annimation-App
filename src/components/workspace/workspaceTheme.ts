// Editor palette shared by the drawing workspace chrome. Matches Home/Help/Assistant.
// Hover (#0066FF fill, white text) is applied by workspaceTheme.module.css, not inline styles.
export const workspaceColors = {
  page: "#030914", // darkest background
  chrome: "#071120", // top bar, timeline, side panel, AI panel, tool bar backgrounds
  stage: "#030914", // dark work areas: canvas surround and AI chat section
  panel: "#071120", // buttons and pop-up menus at rest
  inset: "#030914", // dark wells for inputs/cards inside the brighter chrome panels
  chatBox: "#071120", // brighter chat box on the dark AI section (matches the Assistant)
  chatBoxBorder: "#244267",
  divider: "#163058", // hairlines between areas
  border: "#244267", // button/card borders at rest
  selectedFill: "#0f2a52", // dull blue: current tool, active tab, current frame, toggle on
  selectedBorder: "#3a6aa3",
  hover: "#0066ff", // bright blue, hover only
  textPrimary: "#f6f9ff",
  textSecondary: "#c9d6ea",
  textMuted: "#8fabd0",
  label: "#7895bc", // small uppercase labels
  accentMuted: "#8cbbf3", // dull blue accent text
  iconMuted: "#7296bd",
  danger: "#ff8a95",
} as const;
