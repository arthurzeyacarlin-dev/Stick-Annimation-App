import {useEffect, useRef, useState} from "react";

type StickFigureTopBarProps = {projectTitle?: string};

export function StickFigureTopBar({projectTitle = "Untitled Stick Project"}: StickFigureTopBarProps) {
  const [fileOpen, setFileOpen] = useState(false);
  const fileRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!fileOpen) return;
    const close = (event: PointerEvent) => {if (!fileRef.current?.contains(event.target as Node)) setFileOpen(false);};
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [fileOpen]);
  return (
    <header style={{height: 44, flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "0 14px", background: "#111720", borderBottom: "1px solid rgba(255,255,255,.09)", color: "rgba(255,255,255,.86)"}}>
      <div ref={fileRef} style={{position: "relative"}}>
        <button type="button" aria-haspopup="menu" aria-expanded={fileOpen} onClick={() => setFileOpen((value) => !value)} style={menuButton}>File</button>
        {fileOpen ? (
          <div role="menu" aria-label="File menu" style={{position: "absolute", zIndex: 40, left: 0, top: 34, width: 210, padding: 6, borderRadius: 9, border: "1px solid rgba(255,255,255,.14)", background: "#202631", boxShadow: "0 14px 30px rgba(0,0,0,.4)"}}>
            <UnavailableMenuItem label="Save — unavailable" title="Save arrives in a later phase. This project is not persisted." />
            <UnavailableMenuItem label="Save As — unavailable" title="Save As is unavailable in this version." />
            <UnavailableMenuItem label="Open — unavailable" title="Open Project for Stick projects arrives with persistence." />
          </div>
        ) : null}
      </div>
      {(["Edit", "View", "Window", "Help"] as const).map((label) => <button type="button" key={label} aria-disabled="true" title={`${label} menu is unavailable in this version.`} style={{...menuButton, color: "rgba(255,255,255,.45)"}}>{label}</button>)}
      <span style={{width: 1, height: 22, background: "rgba(255,255,255,.1)", margin: "0 4px"}} />
      <button type="button" aria-label="Undo" disabled title="Undo is unavailable in Phase 2; no history is created." style={historyButton}>↶</button>
      <button type="button" aria-label="Redo" disabled title="Redo is unavailable in Phase 2; no history is created." style={historyButton}>↷</button>
      <strong style={{fontSize: 13, marginLeft: 8}}>{projectTitle}</strong>
      <span style={{marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,.52)"}}>Manual Stick editor · local session only</span>
    </header>
  );
}

function UnavailableMenuItem({label, title}: {label: string; title: string}) {
  return <button type="button" role="menuitem" disabled title={title} style={{width: "100%", textAlign: "left", padding: "8px 9px", border: 0, borderRadius: 6, background: "transparent", color: "rgba(255,255,255,.38)"}}>{label}</button>;
}

const menuButton = {border: 0, borderRadius: 6, padding: "5px 8px", background: "transparent", color: "rgba(255,255,255,.72)", cursor: "pointer"} as const;
const historyButton = {width: 28, height: 28, border: 0, borderRadius: 7, background: "rgba(255,255,255,.025)", color: "rgba(255,255,255,.35)"} as const;
