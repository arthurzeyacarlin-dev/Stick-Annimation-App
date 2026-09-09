"use client";

import { useEffect, useRef, useState } from "react";
import { listProjectCollection, type ProjectCollectionEntry } from "@/src/lib/animation/unifiedProjectCollection";
import { createBrowserProjectSourceReader } from "@/src/lib/animation/unifiedProjectSourceReader";
import type { BootstrapResult } from "@/src/lib/animation/unifiedWorkspaceBootstrap";

type Props = {
  onBack: () => void;
  onOpenProject: (entry: ProjectCollectionEntry) => Promise<BootstrapResult>;
};

const emptyStateStyle = {
  minHeight: 220,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center" as const,
  color: "rgba(255,255,255,0.55)",
  fontSize: "13px",
  width: "100%",
};

const formatUpdatedAt = (updatedAt: string | null) => {
  if (!updatedAt) return "Local project";
  const value = new Date(updatedAt);
  return Number.isNaN(value.getTime()) ? "Local project" : value.toLocaleString();
};

export function OpenProjectBrowser({ onBack, onOpenProject }: Props) {
  const [backHover, setBackHover] = useState(false);
  const [entries, setEntries] = useState<ProjectCollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const activeRef = useRef(true);
  const busyRef = useRef(false);

  useEffect(() => {
    let active = true;
    activeRef.current = true;
    void listProjectCollection(createBrowserProjectSourceReader()).then((collection) => {
      if (active) {
        setEntries(collection);
        setLoading(false);
      }
    }).catch(() => {
      if (active) {
        setMessage("Local projects could not be read. Nothing was changed.");
        setLoading(false);
      }
    });
    return () => {
      active = false;
      activeRef.current = false;
    };
  }, []);

  const open = async (entry: ProjectCollectionEntry) => {
    if (busyRef.current || entry.classification === "invalid") return;
    busyRef.current = true;
    setBusy(entry.id);
    setMessage("Checking the complete local project before opening…");
    const result = await onOpenProject(entry);
    if (!activeRef.current) return;
    if (result.status === "failed") {
      setMessage(`This project could not be opened safely (${result.code}). The current editor was not changed.`);
    } else if (result.status === "stale") {
      setMessage("Open cancelled. Nothing was changed.");
    }
    busyRef.current = false;
    setBusy(null);
  };

  return (
    <main
      data-open-project-browser="true"
      aria-label="Projects"
      style={{
        minHeight: "100vh",
        background: "rgb(26, 27, 36)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        padding: "20px 20px 56px 20px",
        position: "relative",
      }}
    >
      <div
        style={{
          width: "min(1120px, 100%)",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "30px",
        }}
      >
        <div
          style={{
            minHeight: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <button
            type="button"
            onClick={(event) => {
              event.currentTarget.blur();
              setBackHover(false);
              onBack();
            }}
            onMouseEnter={() => setBackHover(true)}
            onMouseLeave={() => setBackHover(false)}
            onBlur={() => setBackHover(false)}
            style={{
              padding: "10px 12px",
              borderRadius: "10px",
              border: backHover
                ? "1px solid rgba(64,142,255,0.58)"
                : "1px solid rgba(255,255,255,0.15)",
              background: backHover ? "rgba(12,45,86,0.42)" : "rgba(255,255,255,0.05)",
              boxShadow: backHover
                ? "0 0 14px rgba(22,96,194,0.16), 0 8px 18px rgba(0,0,0,0.28)"
                : "none",
              color: "rgba(255,255,255,0.88)",
              fontSize: "13px",
              cursor: "pointer",
              outline: "none",
              appearance: "none",
              transition: "all 160ms ease",
            }}
          >
            ← Back
          </button>

          <div
            style={{
              fontSize: "12px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.48)",
            }}
          >
            Projects
          </div>

          <div style={{ width: 72 }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
          {message ? (
            <div role="status" aria-live="polite" style={{ color: "rgba(255,255,255,0.72)", fontSize: 12 }}>
              {message}
            </div>
          ) : null}

          <div style={{ color: "rgba(255,255,255,0.52)", fontSize: 11 }}>
            Saved only in this browser. This version does not cloud-sync, appear on another device, or automatically recover after data is cleared or lost.
          </div>

          {loading ? (
            <div style={emptyStateStyle}>Loading local projects…</div>
          ) : entries.length === 0 ? (
            <div style={emptyStateStyle}>No saved projects yet.</div>
          ) : entries.map((entry) => {
            const invalid = entry.classification === "invalid";
            const isBusy = busy === entry.id;
            return (
              <button
                key={entry.id}
                data-project-card="true"
                type="button"
                aria-label={invalid ? `${entry.title} unavailable` : `Open ${entry.title}`}
                disabled={invalid || busy !== null}
                onClick={() => void open(entry)}
                style={{
                  borderRadius: "16px",
                  border: "1px solid rgba(255,255,255,0.05)",
                  background: "rgba(255,255,255,0.035)",
                  boxShadow: "0 14px 34px rgba(0,0,0,0.16)",
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "14px",
                  color: "rgba(255,255,255,0.90)",
                  textAlign: "left",
                  cursor: invalid || busy !== null ? "default" : "pointer",
                  opacity: invalid ? 0.72 : 1,
                }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: "15px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {entry.title}
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.58)", fontSize: "12px" }}>
                    {formatUpdatedAt(entry.updatedAt)}
                  </span>
                </span>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.58)", whiteSpace: "nowrap" }}>
                  {isBusy ? "Working…" : invalid ? "Unavailable" : "Saved on this browser"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
