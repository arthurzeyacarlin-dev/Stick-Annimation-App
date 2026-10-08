// The bench page's colors: the app's dark workspace palette (src/components/workspace/workspaceTheme.ts).
import { workspaceColors as w } from "@/src/components/workspace/workspaceTheme";

export const benchColors = {
  page: w.page,
  panel: w.chrome,
  inset: w.inset,
  border: w.border,
  divider: w.divider,
  selected: w.selectedFill,
  selectedBorder: w.selectedBorder,
  text: w.textPrimary,
  secondary: w.textSecondary,
  muted: w.textMuted,
  label: w.label,
  accent: w.accentMuted,
  danger: w.danger,
  good: "#7ee2a8",
  ok: "#f4d27a",
  bad: w.danger,
} as const;
