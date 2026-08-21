import type { CSSProperties, ReactNode } from "react";

import type {StickFigureAiWorkspaceAdapterV2} from "../../../lib/ai/stickFigureAiWorkspaceAdapter";
import {StickFigureAiPanel} from "./StickFigureAiPanel";
import type { StickFigureToolName } from "./StickFigureToolBar";
import type { StickFigureStructureJoint, StickFigureStructureTool } from "./types";

const PANEL_TABS = ["Stick Figure Tools", "Properties", "Library", "Assets"] as const;
export type StickFigureRightPanelTab = (typeof PANEL_TABS)[number];

const DRAWING_SYMBOL_ITEMS = [
  { title: "Speed Lines", meta: "Reusable symbol" },
  { title: "Spark Burst", meta: "FX mark" },
  { title: "Arrow Pack", meta: "Callout set" },
] as const;

const STICK_SYMBOL_ITEMS = [
  { title: "Walk Cycle Base", meta: "Stick symbol" },
  { title: "Fight Pose Set", meta: "Figure symbol" },
  { title: "Gesture Pack", meta: "Pose symbol" },
  { title: "Hero Silhouette", meta: "Rig symbol" },
] as const;

const ASSET_ITEMS = [
  { title: "Studio Backdrop", meta: "Background image" },
  { title: "Pose Sheet", meta: "Reference item" },
  { title: "Prop Board", meta: "Imported asset" },
  { title: "Color Card", meta: "Reference image" },
] as const;

const shellBackground = "rgba(18,22,28,0.92)";

const introLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "rgba(180,220,255,0.62)",
  userSelect: "none",
};

const introTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "rgba(255,255,255,0.92)",
  userSelect: "none",
};

const introBodyStyle: CSSProperties = {
  color: "rgba(255,255,255,0.62)",
  fontSize: 12,
  lineHeight: 1.55,
};

const sectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 14,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.022))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.46)",
  userSelect: "none",
};

const sectionDescriptionStyle: CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 12,
  lineHeight: 1.5,
};

const actionRowStyle: CSSProperties = {
  minHeight: 38,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.035)",
  padding: "10px 12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  color: "rgba(255,255,255,0.88)",
  fontSize: 12,
  fontWeight: 600,
  userSelect: "none",
};

const metaPillStyle: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(110,170,255,0.22)",
  background: "rgba(110,170,255,0.10)",
  color: "rgba(210,230,255,0.82)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

const fauxButtonStyle: CSSProperties = {
  minHeight: 36,
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.045)",
  color: "rgba(255,255,255,0.88)",
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.2,
  userSelect: "none",
  textAlign: "center",
  pointerEvents: "none",
};

const activeFauxButtonStyle: CSSProperties = {
  border: "1px solid rgba(110,170,255,0.36)",
  background: "rgba(110,170,255,0.14)",
  color: "rgba(225,238,255,0.96)",
};

const swatchStyle = (background: string): CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
  flexShrink: 0,
});

type FauxSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

type StickFigureRightPanelProps = {
  aiAdapter: StickFigureAiWorkspaceAdapterV2;
  activeTab: StickFigureRightPanelTab;
  onActiveTabChange: (tab: StickFigureRightPanelTab) => void;
  activeTool: StickFigureToolName | null;
  structureTool: StickFigureStructureTool;
  structureJointCount: number;
  structureLimbCount: number;
  selectedStructureJoint: StickFigureStructureJoint | null;
  selectedStructureJointConnectionCount: number;
  canvasMovementEnabled: boolean;
  zoomInputValue: string;
  canvasBackgroundColor: string;
  onActivateStructureLimb: () => void;
  onOpenStickFigureCreator: () => void;
  onCanvasMovementChange: (enabled: boolean) => void;
  onClearStructureSelection: () => void;
  onZoomInputChange: (value: string) => void;
  onApplyZoomInput: () => void;
  onResetCanvasView: () => void;
  onClearCanvasContent: () => void;
  onCanvasBackgroundColorChange: (color: string) => void;
};

type FauxActionRowProps = {
  label: string;
  hint?: string;
};

type FauxMetricRowProps = {
  label: string;
  control: ReactNode;
};

function FauxSection({ title, description, children }: FauxSectionProps) {
  return (
    <section style={sectionStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={sectionLabelStyle}>{title}</div>
        {description ? <div style={sectionDescriptionStyle}>{description}</div> : null}
      </div>
      {children}
    </section>
  );
}

function FauxActionRow({ label, hint }: FauxActionRowProps) {
  return (
    <div aria-hidden="true" style={actionRowStyle}>
      <span>{label}</span>
      {hint ? <span style={metaPillStyle}>{hint}</span> : <span style={{ color: "rgba(255,255,255,0.34)" }}>+</span>}
    </div>
  );
}

function FauxSlider({ widthLabel }: { widthLabel: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        aria-hidden="true"
        style={{
          flex: 1,
          height: 8,
          borderRadius: 999,
          background: "rgba(255,255,255,0.10)",
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: widthLabel,
            maxWidth: "100%",
            height: "100%",
            borderRadius: 999,
            background: "linear-gradient(90deg, rgba(110,170,255,0.76), rgba(143,198,255,0.92))",
            boxShadow: "0 0 12px rgba(110,170,255,0.18)",
          }}
        />
      </div>
      <div
        style={{
          minWidth: 42,
          textAlign: "right",
          fontSize: 11,
          fontWeight: 700,
          color: "rgba(225,238,255,0.82)",
          userSelect: "none",
        }}
      >
        {widthLabel}
      </div>
    </div>
  );
}

function FauxToggle({ enabled }: { enabled: boolean }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 52,
        height: 28,
        borderRadius: 999,
        border: enabled ? "1px solid rgba(110,170,255,0.34)" : "1px solid rgba(255,255,255,0.10)",
        background: enabled ? "rgba(110,170,255,0.16)" : "rgba(255,255,255,0.06)",
        padding: 3,
        boxSizing: "border-box",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: enabled ? "rgba(225,238,255,0.96)" : "rgba(255,255,255,0.46)",
          transform: enabled ? "translateX(24px)" : "translateX(0)",
          transition: "none",
        }}
      />
    </div>
  );
}

function FauxMetricRow({ label, control }: FauxMetricRowProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.62)",
          fontWeight: 600,
          userSelect: "none",
        }}
      >
        {label}
      </div>
      {control}
    </div>
  );
}

function FauxLibraryGrid({
  items,
  accentLabel,
}: {
  items: readonly { title: string; meta: string }[];
  accentLabel: string;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {items.map((item) => (
        <div
          key={item.title}
          aria-hidden="true"
          style={{
            minHeight: 88,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.028)",
            padding: 10,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: "1px solid rgba(110,170,255,0.20)",
              background: "linear-gradient(180deg, rgba(110,170,255,0.18), rgba(110,170,255,0.05))",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 12, fontWeight: 700 }}>{item.title}</div>
            <div style={{ color: "rgba(255,255,255,0.54)", fontSize: 11 }}>{item.meta}</div>
          </div>
          <div style={{ color: "rgba(180,220,255,0.64)", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em" }}>
            {accentLabel}
          </div>
        </div>
      ))}
    </div>
  );
}

function FauxSwatchRow({ label, fill, tone }: { label: string; fill: string; tone: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        minHeight: 38,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.03)",
        padding: "8px 10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={swatchStyle(fill)} />
        <div style={{ color: "rgba(255,255,255,0.86)", fontSize: 12, fontWeight: 600 }}>{label}</div>
      </div>
      <div style={{ color: "rgba(255,255,255,0.52)", fontSize: 11 }}>{tone}</div>
    </div>
  );
}

function ToolsTabContent({
  structureTool,
  onActivateStructureLimb,
  onOpenStickFigureCreator,
}: Pick<StickFigureRightPanelProps, "structureTool" | "onActivateStructureLimb" | "onOpenStickFigureCreator">) {
  const isStructureActive = structureTool === "addLimb";

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={introLabelStyle}>Stick Figure Workspace</div>
        <div style={introTitleStyle}>Stick Figure Tools</div>
        <div style={introBodyStyle}>Create a figure first, then use structure and rig controls to frame out the stick figure workflow.</div>
      </div>

      <FauxSection title="Create" description="Primary entry point for starting a new stick figure. Layout only for now.">
        <button
          type="button"
          onClick={onOpenStickFigureCreator}
          style={{
            ...fauxButtonStyle,
            ...activeFauxButtonStyle,
            minHeight: 46,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 800,
            pointerEvents: "auto",
            cursor: "pointer",
            appearance: "none",
            outline: "none",
          }}
        >
          Create New Stick Figure
        </button>
      </FauxSection>

      <FauxSection title="Structure Controls" description="Core limb structure actions stay grouped together.">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="button"
            onClick={onActivateStructureLimb}
            style={{
              minHeight: 40,
              borderRadius: 10,
              border: isStructureActive ? "1px solid rgba(110,170,255,0.34)" : "1px solid rgba(255,255,255,0.10)",
              background: isStructureActive ? "rgba(110,170,255,0.12)" : "rgba(255,255,255,0.045)",
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              color: isStructureActive ? "rgba(225,238,255,0.96)" : "rgba(255,255,255,0.88)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              appearance: "none",
              outline: "none",
            }}
          >
            <span>Add Limb</span>
            <span style={isStructureActive ? metaPillStyle : { ...metaPillStyle, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.64)" }}>
              {isStructureActive ? "Active" : "Build"}
            </span>
          </button>

          <FauxActionRow label="Remove Limb" hint="Soon" />
          <FauxActionRow label="Connect Limb" hint="Soon" />

          <div
            style={{
              borderRadius: 10,
              border: "1px solid rgba(110,170,255,0.14)",
              background: "rgba(110,170,255,0.06)",
              padding: "10px 12px",
              color: "rgba(225,238,255,0.78)",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            Click and drag on the canvas to place a limb. Start from an endpoint to extend the connected skeleton chain.
          </div>
        </div>
      </FauxSection>

      <FauxSection title="Rig Controls" description="Rig-specific controls stay separate from limb structure actions.">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <FauxActionRow label="Add Joint" hint="Soon" />
        </div>
      </FauxSection>
    </>
  );
}

function SelectPropertiesTabContent({
  canvasMovementEnabled,
  zoomInputValue,
  canvasBackgroundColor,
  onCanvasMovementChange,
  onZoomInputChange,
  onApplyZoomInput,
  onResetCanvasView,
  onClearCanvasContent,
  onCanvasBackgroundColorChange,
}: Pick<
  StickFigureRightPanelProps,
  | "canvasMovementEnabled"
  | "zoomInputValue"
  | "canvasBackgroundColor"
  | "onCanvasMovementChange"
  | "onZoomInputChange"
  | "onApplyZoomInput"
  | "onResetCanvasView"
  | "onClearCanvasContent"
  | "onCanvasBackgroundColorChange"
>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ color: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: 800, letterSpacing: 0.4 }}>SELECT TOOL</div>
        <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>Navigate and move the canvas</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ color: "rgba(255,255,255,0.52)", fontSize: 11, fontWeight: 700, letterSpacing: 0.7 }}>VIEW</div>
        <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
          Zoom
          <input
            type="text"
            value={zoomInputValue}
            onChange={(event) => onZoomInputChange(event.target.value)}
            onBlur={onApplyZoomInput}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onApplyZoomInput();
              }
            }}
            style={{
              width: 120,
              padding: "7px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.86)",
              fontSize: 13,
            }}
          />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start", paddingTop: 2 }}>
          <button
            type="button"
            onClick={onResetCanvasView}
            style={{
              width: 168,
              padding: "9px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.86)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Reset View
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ color: "rgba(255,255,255,0.52)", fontSize: 11, fontWeight: 700, letterSpacing: 0.7 }}>CANVAS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: "rgba(255,255,255,0.76)", fontSize: 12 }}>Show Canvas</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([
              { label: "On", value: true },
              { label: "Off", value: false },
            ] as const).map((option) => {
              const isSelected = canvasMovementEnabled === option.value;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => onCanvasMovementChange(option.value)}
                  style={{
                    minHeight: 34,
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: isSelected ? "1px solid rgba(110,170,255,0.34)" : "1px solid rgba(255,255,255,0.12)",
                    background: isSelected ? "rgba(110,170,255,0.10)" : "rgba(255,255,255,0.04)",
                    color: isSelected ? "rgba(225,238,255,0.92)" : "rgba(255,255,255,0.82)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
          <button
            type="button"
            onClick={onClearCanvasContent}
            style={{
              width: 168,
              padding: "9px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.86)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Clear Canvas
          </button>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
          Background Color
          <input
            type="color"
            value={canvasBackgroundColor}
            onChange={(event) => onCanvasBackgroundColorChange(event.target.value)}
            style={{ width: 48, height: 32, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
          />
        </label>
      </div>
    </div>
  );
}

function PropertiesTabContent({
  activeTool,
  canvasMovementEnabled,
  zoomInputValue,
  canvasBackgroundColor,
  onCanvasMovementChange,
  onZoomInputChange,
  onApplyZoomInput,
  onResetCanvasView,
  onClearCanvasContent,
  onCanvasBackgroundColorChange,
}: Pick<
  StickFigureRightPanelProps,
  | "activeTool"
  | "canvasMovementEnabled"
  | "zoomInputValue"
  | "canvasBackgroundColor"
  | "onCanvasMovementChange"
  | "onZoomInputChange"
  | "onApplyZoomInput"
  | "onResetCanvasView"
  | "onClearCanvasContent"
  | "onCanvasBackgroundColorChange"
>) {
  if (activeTool === "Select") {
    return (
      <SelectPropertiesTabContent
        canvasMovementEnabled={canvasMovementEnabled}
        zoomInputValue={zoomInputValue}
        canvasBackgroundColor={canvasBackgroundColor}
        onCanvasMovementChange={onCanvasMovementChange}
        onZoomInputChange={onZoomInputChange}
        onApplyZoomInput={onApplyZoomInput}
        onResetCanvasView={onResetCanvasView}
        onClearCanvasContent={onClearCanvasContent}
        onCanvasBackgroundColorChange={onCanvasBackgroundColorChange}
      />
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={introLabelStyle}>Selected Item</div>
        <div style={introTitleStyle}>Properties</div>
        <div style={introBodyStyle}>A simple presentation-only properties surface for the selected figure, limb, or shape concept.</div>
      </div>

      <FauxSection title="Appearance" description="Core visual attributes stay together and out of the figure-building tab.">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <FauxSwatchRow label="Fill" fill="linear-gradient(135deg, #ffb278 0%, #ff7b70 100%)" tone="Warm accent" />
          <FauxSwatchRow label="Stroke" fill="linear-gradient(135deg, #dbe7ff 0%, #7bb0ff 100%)" tone="Cool outline" />
          <FauxMetricRow label="Opacity" control={<FauxSlider widthLabel="72%" />} />
        </div>
      </FauxSection>

      <FauxSection title="Detail" description="Secondary styling controls show where limb and shape refinements would live.">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: 600 }}>Glow</span>
            <FauxToggle enabled />
          </div>
          <FauxMetricRow label="Thickness / Width" control={<FauxSlider widthLabel="38%" />} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: 600 }}>Rounded</span>
            <FauxToggle enabled={false} />
          </div>
        </div>
      </FauxSection>

      <FauxSection title="Palette" description="Color swatches and preview rows stay lightweight for this layout-only phase.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["#ff7b70", "#ffb278", "#f5e6a7", "#7bb0ff", "#7ce3d6", "#f6f7fb"].map((color) => (
            <div key={color} aria-hidden="true" style={swatchStyle(color)} />
          ))}
        </div>
      </FauxSection>
    </>
  );
}

function LibraryTabContent() {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={introLabelStyle}>Reusable Symbols</div>
        <div style={introTitleStyle}>Library</div>
        <div style={introBodyStyle}>A visual home for saved drawing symbols and stick figure symbols, without adding import, insert, drag, or canvas behavior yet.</div>
      </div>

      <FauxSection title="Stick Figure Symbols" description="Saved rigs, poses, and figure symbols would visually live here in a later behavior pass.">
        <FauxLibraryGrid items={STICK_SYMBOL_ITEMS} accentLabel="FIGURE" />
      </FauxSection>

      <FauxSection title="Drawing Symbols" description="Reusable marks, effects, and quick drawing items stay grouped with symbols instead of acting as tools.">
        <FauxLibraryGrid items={DRAWING_SYMBOL_ITEMS} accentLabel="SYMBOL" />
      </FauxSection>
    </>
  );
}

function AssetsTabContent() {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={introLabelStyle}>Project Resources</div>
        <div style={introTitleStyle}>Assets</div>
        <div style={introBodyStyle}>A premium-feeling layout for imported assets, backgrounds, images, and reference material.</div>
      </div>

      <FauxSection title="Import" description="This shows where external resources would enter the stick figure workspace.">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div aria-hidden="true" style={{ ...fauxButtonStyle, ...activeFauxButtonStyle, width: "fit-content", paddingInline: 14 }}>
            Import Asset
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {["Backgrounds", "Images", "Reference"].map((label) => (
              <div key={label} aria-hidden="true" style={metaPillStyle}>
                {label}
              </div>
            ))}
          </div>
        </div>
      </FauxSection>

      <FauxSection title="Library" description="Imported resources, background plates, and reference items stay grouped in the same visual language.">
        <FauxLibraryGrid items={ASSET_ITEMS} accentLabel="ASSET" />
      </FauxSection>
    </>
  );
}

export function StickFigureRightPanel({
  aiAdapter,
  activeTab,
  onActiveTabChange,
  activeTool,
  structureTool,
  canvasMovementEnabled,
  zoomInputValue,
  canvasBackgroundColor,
  onActivateStructureLimb,
  onOpenStickFigureCreator,
  onCanvasMovementChange,
  onZoomInputChange,
  onApplyZoomInput,
  onResetCanvasView,
  onClearCanvasContent,
  onCanvasBackgroundColorChange,
}: StickFigureRightPanelProps) {
  const rightPanelContent =
    activeTab === "Stick Figure Tools" ? (
      <ToolsTabContent
        structureTool={structureTool}
        onActivateStructureLimb={onActivateStructureLimb}
        onOpenStickFigureCreator={onOpenStickFigureCreator}
      />
    ) : activeTab === "Properties" ? (
      <PropertiesTabContent
        activeTool={activeTool}
        canvasMovementEnabled={canvasMovementEnabled}
        zoomInputValue={zoomInputValue}
        canvasBackgroundColor={canvasBackgroundColor}
        onCanvasMovementChange={onCanvasMovementChange}
        onZoomInputChange={onZoomInputChange}
        onApplyZoomInput={onApplyZoomInput}
        onResetCanvasView={onResetCanvasView}
        onClearCanvasContent={onClearCanvasContent}
        onCanvasBackgroundColorChange={onCanvasBackgroundColorChange}
      />
    ) : activeTab === "Library" ? (
      <LibraryTabContent />
    ) : (
      <AssetsTabContent />
    );

  return (
    <div
      style={{
        width: 420,
        maxWidth: "46vw",
        borderLeft: "1px solid rgba(255,255,255,0.10)",
        background: shellBackground,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        position: "relative",
      }}
    >
      <style>{`
        .stick-figure-right-panel-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.18) ${shellBackground};
        }

        .stick-figure-right-panel-scroll::-webkit-scrollbar {
          width: 12px;
        }

        .stick-figure-right-panel-scroll::-webkit-scrollbar-track {
          background: ${shellBackground};
        }

        .stick-figure-right-panel-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.18);
          border-radius: 999px;
          border: 2px solid ${shellBackground};
        }

        .stick-figure-right-panel-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.24);
        }
      `}</style>

      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 10px 8px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
        }}
      >
        {PANEL_TABS.map((label) => {
          const isActive = activeTab === label;

          return (
            <button
              key={label}
              type="button"
              onClick={() => onActiveTabChange(label)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: isActive ? "1px solid rgba(110,170,255,0.34)" : "1px solid rgba(255,255,255,0.08)",
                background: isActive ? "rgba(110,170,255,0.10)" : "rgba(255,255,255,0.02)",
                color: isActive ? "rgba(225,238,255,0.92)" : "rgba(255,255,255,0.70)",
                fontSize: 12,
                fontWeight: 600,
                userSelect: "none",
                whiteSpace: "nowrap",
                cursor: "pointer",
                appearance: "none",
                outline: "none",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        className="stick-figure-right-panel-scroll"
        style={{
          flex: "0 0 45%",
          maxHeight: "100%",
          minHeight: 0,
          overflowX: "hidden",
          overflowY: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxSizing: "border-box",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {rightPanelContent}
      </div>

      <StickFigureAiPanel adapter={aiAdapter} />
    </div>
  );
}
