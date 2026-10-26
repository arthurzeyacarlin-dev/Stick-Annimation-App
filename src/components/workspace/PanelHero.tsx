"use client";

import type { ReactNode } from "react";
import { PencilIcon, EraserIcon, FillIcon, LassoIcon, TextIcon, KnifeIcon, ShapeIcon } from "@/src/components/ui/ToolIcons";

// Workspace makeover (Arthur 2026-10-26): every right-panel tab gets the AI Animator's look — a glowing mark, a bold
// title and one friendly line over lit dots. Styles live in app/globals.css (.drawing-ai-empty / .drawing-tool-head).

const ICONS: Record<string, ReactNode> = {
  assets: <><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m4.5 17.5 5-5 3.5 3.5 2.5-2.5 4 4" /></>,
  library: <><path d="M12 3 20 7.5 12 12 4 7.5Z" /><path d="m4 12 8 4.5 8-4.5" /><path d="m4 16.5 8 4.5 8-4.5" /></>,
};

// The exact icons of the tool bar (Arthur: the heading shows the same picture as the tool you picked).
const TOOL_ICONS: Record<string, (props: { size?: number }) => ReactNode> = {
  Pencil: PencilIcon, Eraser: EraserIcon, Fill: FillIcon, Lasso: LassoIcon, Text: TextIcon, Knife: KnifeIcon, Shape: ShapeIcon,
};

const TOOL_LINES: Record<string, string> = {
  Text: "Titles, speech bubbles and labels, right on the frame.",
  Pencil: "Every great animation starts with one line.",
  Eraser: "Clean it up and try again. That's animating.",
  Fill: "Pour color into any closed shape.",
  Lasso: "Draw around anything to grab it.",
  Knife: "Slice a drawing into pieces you can move.",
  Shape: "Clean squares, triangles and circles in one drag.",
};

function Mark({ icon, size }: { icon: string; size: "bare" | "small" }) {
  if (size === "small") {
    const Icon = TOOL_ICONS[icon];
    return <span className="drawing-tool-head-mark" aria-hidden="true">{Icon ? <Icon size={20} /> : null}</span>;
  }
  // Library and Assets: a glowing icon with no box around it (Arthur).
  return <span className="drawing-hero-icon" aria-hidden="true"><svg viewBox="0 0 24 24">{ICONS[icon]}</svg></span>;
}

/** The big centered welcome for an empty tab (Assets, Library). */
export function PanelHero({ icon, title, text, children }: { icon: string; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="drawing-ai-empty">
      <Mark icon={icon} size="bare" />
      <strong>{title}</strong>
      <span className="drawing-ai-empty-text">{text}</span>
      {children}
    </div>
  );
}

/** The heading at the top of a tool's Properties: glowing mark, tool name, one friendly line. */
export function ToolHeader({ tool }: { tool: string }) {
  return (
    <div className="drawing-tool-head">
      <Mark icon={tool} size="small" />
      <span><strong>{tool}</strong><small>{TOOL_LINES[tool] ?? ""}</small></span>
    </div>
  );
}

/** The title row of a tab that has things in it: name, a quiet count, and an optional action on the right. */
export function PanelTitle({ title, meta, children }: { title: string; meta?: string; children?: ReactNode }) {
  return (
    <div className="drawing-panel-title">
      <span><strong>{title}</strong>{meta ? <small>{meta}</small> : null}</span>
      {children}
    </div>
  );
}
