"use client";

// One look for every yes/no choice in the app (Arthur 2026-10-13): a blue pill with a white knob when on, a dark pill
// with a grey knob when off. Choices with 3 or more options use the connected button group instead. Switching on/off
// slides the knob and fades the colors (Arthur 2026-10-25; timing in globals.css "button.da-switch").
export function OnOffSwitch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <span data-workspace-theme-exempt style={{ display: "inline-flex", flex: "0 0 auto" }}>
    <button
      type="button"
      className="da-switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        boxSizing: "border-box", position: "relative", width: 44, height: 24, minHeight: 0, padding: 0, margin: 0, flex: "0 0 auto",
        borderRadius: 999, cursor: "pointer",
        border: checked ? "1px solid var(--da-hover, #0066ff)" : "1px solid var(--da-border, #244267)",
        background: checked ? "var(--da-hover, #0066ff)" : "var(--da-panel, #071120)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute", top: 3, left: 3, width: 16, height: 16, borderRadius: "50%",
          transform: checked ? "translateX(20px)" : "translateX(0)",
          background: checked ? "#ffffff" : "var(--da-muted, #8fabd0)",
        }}
      />
    </button>
    </span>
  );
}
