// The editor's tool icons (SPEC-0022 Phase 5, Arthur 2026-10-13): one clean line style on a 24 grid, round caps and
// joins, 1.9 stroke, drawn in currentColor so they follow the theme. Used by the toolbar and the Home screen.
type IconProps = { size?: number; className?: string };
const base = (size: number) => ({
  viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: 1.9,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const, style: { overflow: "visible" as const },
});

export const SelectIcon = ({ size = 24, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.12 1.58a2 2 0 0 0-1.44 1.43l-1.58 6.13a.5.5 0 0 1-.95.06z" />
  </svg>
);

export const LassoIcon = ({ size = 24, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M3.7 14.47A10 8 0 0 1 2 10a10 8 0 0 1 20 0 10 8 0 0 1-10 8 10 8 0 0 1-5.18-1.16" />
    <path d="M7 22a5 5 0 0 1-2-4" />
    <circle cx="5" cy="16" r="2" />
  </svg>
);

export const PencilIcon = ({ size = 24, className }: IconProps) => (
  <svg {...base(size)} strokeWidth={1.4} className={className}>
    {/* one closed outline: tip, body, band, eraser (all connected), then the cone, bands and the centre ridge */}
    <path d="M2 22 3.69 15.21 13.24 5.66 15.01 3.89 17.83 1.07 22.93 6.17 20.11 8.99 18.34 10.76 8.79 20.31Z" />
    <path d="M13.24 5.66 18.34 10.76M3.69 15.21 8.79 20.31M6.24 17.76 15.79 8.21" />
    <path d="M2 22 2.9 19.78 4.22 21.1Z" fill="currentColor" />
  </svg>
);
export const BrushIcon = PencilIcon;

export const EraserIcon = ({ size = 24, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <g transform="translate(0 1.4)">
      <path d="m7 20-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 20" />
      <path d="m5 10 9 9" />
    </g>
    <path d="M22 21.4H7" />
  </svg>
);

export const FillIcon = ({ size = 24, className }: IconProps) => (
  <svg {...base(size)} strokeWidth={1.6} className={className}>
    {/* "fill" as one simple symbol: a drop of paint, solid, with a small arc inside so it reads as liquid */}
    <path d="M12 2.6C12 2.6 5.2 9.6 5.2 14.8a6.8 6.8 0 0 0 13.6 0C18.8 9.6 12 2.6 12 2.6Z" />
    <path d="M8.7 15.2a3.4 3.4 0 0 0 2.6 3.2" />
  </svg>
);

export const TextIcon = ({ size = 24, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7V4h16v3" />
    <path d="M12 4v16" />
    <path d="M9 20h6" />
  </svg>
);

// Workspace makeover: Knife and Shape live here too, so the tool bar and the Properties heading use the exact same icon.
export const KnifeIcon = ({ size = 24, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    {/* A kitchen knife (Arthur 2026-10-27): handle bottom-left, blade with a curved edge pointing top-right. */}
    <g transform="translate(12 12) rotate(-45) scale(1.16) translate(-12 -12)" strokeWidth={1.64}>
      {/* One connected outline: rounded handle flowing into the blade (flat spine, curved edge, sharp tip). */}
      <path d="M3 11H9.5V8.6H20.8L23.2 9.1C21.8 13.6 17.6 16.4 12.6 16.4H9.5V15.4H3A2.2 2.2 0 0 1 3 11Z" />
    </g>
  </svg>
);

export const ShapeIcon = ({ size = 24, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3l4.5 7.5h-9Z" />
    <circle cx="7" cy="17" r="3.6" />
    <rect x="13.4" y="13.4" width="7.2" height="7.2" rx="1" />
  </svg>
);
