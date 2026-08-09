"use client";

import { DrawingWorkspace } from "@/src/components/workspace/DrawingWorkspace";
import { useEffect, useState } from "react";

export default function Page() {
  const [view, setView] = useState<"home" | "newProject" | "drawingWorkspace">("home");
  const [menuHover, setMenuHover] = useState(false);
  const [newProjectBackHover, setNewProjectBackHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
const [termsOpen, setTermsOpen] = useState(false);
const [welcomeOpen, setWelcomeOpen] = useState(false);
const [welcomeStep, setWelcomeStep] = useState<0 | 1>(0);
const [guidedChoices, setGuidedChoices] = useState<string[]>([]);  
const [hoveredCard, setHoveredCard] = useState<
    | null
    | "new"
    | "open"
    | "tutorials"
    | "assistant"
    | "export"
    | "aiProject"
    | "addons"
  >(null);
  const CARD_W = "620px";
  const CARD_MAX_W = "calc(100vw - 80px)";

  const cardStyle = (isHover: boolean) =>
    ({
      padding: "22px 54px",
      borderRadius: "14px",
      border: isHover ? "1px solid rgba(110, 170, 255, 0.48)" : "1px solid rgba(70, 120, 210, 0.30)",
      background: "rgba(255,255,255,0.04)",
      color: "white",
      cursor: "pointer",
      outline: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      textAlign: "left" as const,
      width: "100%",
      transition: "transform 240ms ease, border-color 160ms ease, background 160ms ease",
      transform: isHover ? "translateY(-1px)" : "translateY(0)",
      boxShadow: "none",
    } as const);

  const cardOuterStyle = {
    width: CARD_W,
    maxWidth: CARD_MAX_W,
    marginLeft: "auto",
    marginRight: "auto",
  } as const;

  const cardInnerRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: "18px",
  
    width: "100%",
    transform: "translateX(-28px)",
  } as const;
  const [menuView, setMenuView] = useState<"root" | "about" | "terms">("root");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
if (e.key === "Escape") {
  setMenuOpen(false);
  setAboutOpen(false);
  setTermsOpen(false);
  setWelcomeOpen(false);
}
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);useEffect(() => {
  // First-time welcome (client-only)
  try {
    const never = localStorage.getItem("da_welcome_never_show") === "1";
    const seen = localStorage.getItem("da_welcome_seen") === "1";
    if (!never && !seen) {
      setWelcomeStep(0);
      setWelcomeOpen(true);
    }
  } catch {
    // ignore
  }
  }, []);
  useEffect(() => {
    // Prevent stale hover/focus state when switching screens
    if (view !== "home") setHoveredCard(null);
  }, [view]);

  useEffect(() => {
    // Fix: New Project back button hover can get "stuck" if we switch views while hovered.
    if (view !== "newProject") setNewProjectBackHover(false);
  }, [view]);

const toggleGuidedChoice = (key: string) => {
  setGuidedChoices((prev) =>
    prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
  );
};

const closeWelcome = (opts?: { neverShow?: boolean; markSeen?: boolean }) => {
  try {
    if (opts?.neverShow) localStorage.setItem("da_welcome_never_show", "1");
    if (opts?.markSeen) localStorage.setItem("da_welcome_seen", "1");
    if (opts?.markSeen && guidedChoices.length) {
      localStorage.setItem("da_guided_choices", JSON.stringify(guidedChoices));
    }
  } catch {
    // ignore
  }
  setWelcomeOpen(false);
};

  return (
<div
  className="app"
  style={{
    height: "100vh",
    background: "rgb(26, 27, 36)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden", // IMPORTANT: keep page scrollbar from being on <body>
  }}
>
      {/* TOP BAR */}
      {view === "home" && (
        <header
          className="topBar"
          style={{
            padding: "2px 24px 16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
            background: "rgb(20, 24, 32)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            zIndex: 10,
          }}
        >
          <div className="topLeft">
            <div className="brandStack">
              <h1 className="title" style={{ margin: "-2px 0 2px 0", lineHeight: 0.95 }}>
                Diamond Animator Pro
                <span style={{ marginLeft: "18px", display: "inline-flex", alignItems: "center", marginTop: "11px" }}>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: "64px", height: "64px" }}
                  >
                    <path d="M3 9l4-5h10l4 5-9 11L3 9z" />
                  </svg>
                </span>
              </h1>
              <p className="tagline" style={{ margin: "-22px 0 2px 0" }}>
                Create. Animate. Dominate.
              </p>
            </div>
          </div>

          <div className="topRight">
            <button
              className="menuBtn"
              aria-label="Menu"
              onClick={() => setMenuOpen((v) => !v)}
              onMouseEnter={() => setMenuHover(true)}
              onMouseLeave={() => setMenuHover(false)}
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                border: menuHover ? "1px solid rgba(255,255,255,0.28)" : "1px solid rgba(255,255,255,0.15)",
                background: menuHover ? "rgba(255,255,255,0.085)" : "rgba(255,255,255,0.05)",
                boxShadow: menuHover ? "0 0 14px rgba(255,255,255,0.10), 0 8px 18px rgba(0,0,0,0.28)" : "none",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                gap: "5px",
                cursor: "pointer",
                transition: "all 160ms ease",
                alignSelf: "center",
                transform: "translateY(7px)",
              }}
            >
              <span style={{ width: "18px", height: "2px", background: menuHover ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.92)", borderRadius: "2px" }} />
              <span style={{ width: "18px", height: "2px", background: menuHover ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.92)", borderRadius: "2px" }} />
              <span style={{ width: "18px", height: "2px", background: menuHover ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.92)", borderRadius: "2px" }} />
            </button>
          </div>
        </header>
      )}

{/* WELCOME OVERLAY (first-time guided setup) */}
{view === "home" && (
  <>
    <div
      aria-hidden={!welcomeOpen}
      onClick={(e) => {
        // IMPORTANT: Do NOT allow clicking outside the welcome to close it.
        // Users must choose buttons inside the welcome.
        e.stopPropagation();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.50)",
        opacity: welcomeOpen ? 1 : 0,
        transition: "opacity 180ms ease",
        pointerEvents: welcomeOpen ? "auto" : "none",
        zIndex: 60,
      }}
    />

    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Diamond Animator Pro"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: 14,
        left: "50%",
        transform: welcomeOpen
          ? "translateX(-50%) translateY(0)"
          : "translateX(-50%) translateY(-18px)",
        opacity: welcomeOpen ? 1 : 0,
        transition: "transform 220ms ease, opacity 180ms ease",
        width: "min(860px, calc(100vw - 40px))",
        borderRadius: "12px",
        border: "1px solid rgba(110, 170, 255, 0.22)",
        background: "rgba(18,22,28,0.98)",
        boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
        padding: "16px 16px",
        zIndex: 70,
        pointerEvents: welcomeOpen ? "auto" : "none",
      }}
    >
  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px" }}>
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div
        style={{
          fontSize: "12px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(180,220,255,0.75)",
        }}
      >
        {welcomeStep === 0 ? "Welcome" : "Guided setup"}
      </div>
      <div style={{ fontSize: "18px", fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>
        {welcomeStep === 0 ? "Welcome to Diamond Animator Pro" : "Choose your guided setup"}
      </div>
    </div>

    <button
      aria-label="Close welcome"
      onClick={() => closeWelcome({ markSeen: true })}
      style={{
        appearance: "none",
        border: "none",
        background: "transparent",
        padding: "4px 8px",
        margin: 0,
        color: "rgba(255,255,255,0.85)",
        fontSize: "28px",
        lineHeight: 1,
        cursor: "pointer",
      }}
    >
      ×
    </button>
  </div>

  <div style={{ height: 10 }} />

  {/* Step 0: intro */}
  {welcomeStep === 0 && (
    <>
      <div style={{ color: "rgba(255,255,255,0.72)", fontSize: "13px", lineHeight: 1.55 }}>
        Welcome to Diamond Animator Pro. Would you like a guided setup?
      </div>

      <div style={{ height: 12 }} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        <button
          type="button"
          onClick={() => setWelcomeStep(1)}
          style={{
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid rgba(110, 170, 255, 0.30)",
            background: "rgba(110, 170, 255, 0.10)",
            color: "rgba(255,255,255,0.92)",
            fontSize: "13px",
            fontWeight: 650,
            cursor: "pointer",
            appearance: "none",
          }}
        >
          Continue with guided setup
        </button>

        <button
          type="button"
          onClick={() => closeWelcome({ neverShow: true, markSeen: true })}
          style={{
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.035)",
            color: "rgba(255,255,255,0.72)",
            fontSize: "13px",
            cursor: "pointer",
            appearance: "none",
          }}
        >
          Don't show again
        </button>
      </div>
    </>
  )}

  {/* Step 1: choose guided setup */}
  {welcomeStep === 1 && (
    <>
      <div style={{ color: "rgba(255,255,255,0.80)", fontSize: "13px", lineHeight: 1.55 }}>
        What guided setup would you like?
      </div>

      <div style={{ height: 12 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <button
          type="button"
          onClick={() => toggleGuidedChoice("beginner")}
          style={{
            textAlign: "left",
            padding: "12px 12px",
            borderRadius: "12px",
            border: guidedChoices.includes("beginner")
              ? "1px solid rgba(110, 170, 255, 0.50)"
              : "1px solid rgba(255,255,255,0.10)",
            background: guidedChoices.includes("beginner")
              ? "rgba(110, 170, 255, 0.10)"
              : "rgba(255,255,255,0.035)",
            color: "rgba(255,255,255,0.90)",
            cursor: "pointer",
            appearance: "none",
          }}
        >
          <div style={{ fontWeight: 750, fontSize: "13px" }}>Learn animation fundamentals</div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: "12px", marginTop: 4 }}>
            Smooth start + confidence boosters.
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleGuidedChoice("pro")}
          style={{
            textAlign: "left",
            padding: "12px 12px",
            borderRadius: "12px",
            border: guidedChoices.includes("pro")
              ? "1px solid rgba(110, 170, 255, 0.50)"
              : "1px solid rgba(255,255,255,0.10)",
            background: guidedChoices.includes("pro")
              ? "rgba(110, 170, 255, 0.10)"
              : "rgba(255,255,255,0.035)",
            color: "rgba(255,255,255,0.90)",
            cursor: "pointer",
            appearance: "none",
          }}
        >
          <div style={{ fontWeight: 750, fontSize: "13px" }}>Speed up your workflow</div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: "12px", marginTop: 4 }}>
            Faster production and efficient tools.
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleGuidedChoice("visionary")}
          style={{
            textAlign: "left",
            padding: "12px 12px",
            borderRadius: "12px",
            border: guidedChoices.includes("visionary")
              ? "1px solid rgba(110, 170, 255, 0.50)"
              : "1px solid rgba(255,255,255,0.10)",
            background: guidedChoices.includes("visionary")
              ? "rgba(110, 170, 255, 0.10)"
              : "rgba(255,255,255,0.035)",
            color: "rgba(255,255,255,0.90)",
            cursor: "pointer",
            appearance: "none",
          }}
        >
          <div style={{ fontWeight: 750, fontSize: "13px" }}>Build ambitious animation projects</div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: "12px", marginTop: 4 }}>
            Scale your ideas with optional AI assistance.
          </div>
        </button>
      </div>

      <div style={{ height: 12 }} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        <button
          type="button"
          disabled={guidedChoices.length === 0}
          onClick={() => closeWelcome({ markSeen: true })}
          style={{
            padding: "10px 12px",
            borderRadius: "10px",
            border: guidedChoices.length === 0
              ? "1px solid rgba(255,255,255,0.10)"
              : "1px solid rgba(110, 170, 255, 0.30)",
            background: guidedChoices.length === 0
              ? "rgba(255,255,255,0.035)"
              : "rgba(110, 170, 255, 0.10)",
            color: guidedChoices.length === 0
              ? "rgba(255,255,255,0.45)"
              : "rgba(255,255,255,0.92)",
            fontSize: "13px",
            fontWeight: 650,
            cursor: guidedChoices.length === 0 ? "not-allowed" : "pointer",
            appearance: "none",
          }}
        >
          Finish setup
        </button>

        <button
          type="button"
          onClick={() => closeWelcome({ neverShow: true, markSeen: true })}
          style={{
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.035)",
            color: "rgba(255,255,255,0.72)",
            fontSize: "13px",
            cursor: "pointer",
            appearance: "none",
          }}
        >
          Don't show again
        </button>
      </div>
    </>
  )}
    </div>
  </>
)}
      
      {/* MENU OVERLAY + PANEL */}
      {view === "home" && (
        <>
          <div
            aria-hidden={!menuOpen}
            onClick={() => {
              setMenuOpen(false);
              setAboutOpen(false);
              setTermsOpen(false);
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.48)",
              backdropFilter: "none",
              WebkitBackdropFilter: "none",
              opacity: menuOpen ? 1 : 0,
              transition: "opacity 180ms ease",
              pointerEvents: menuOpen ? "auto" : "none",
              zIndex: 45,
            }}
          />

          <aside
            aria-label="Menu panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              height: "100vh",
              width: "300px",
              background: "rgba(18,22,28,0.96)",
              borderLeft: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "none",
              transform: menuOpen ? "translateX(0)" : "translateX(320px)",
              transition: "transform 220ms ease",
              zIndex: 50,
              padding: "18px 16px 26px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "18px",
              pointerEvents: menuOpen ? "auto" : "none",
            }}
          >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              fontSize: "12px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.55)",
            }}
          >
            Menu
          </div>

          <button
            aria-label="Close menu"
            onClick={() => {
              setMenuOpen(false);
              setMenuView("root");
            }}
            style={{
              appearance: "none",
              border: "none",
              background: "transparent",
              padding: 0,
              margin: 0,
              color: "rgba(255,255,255,0.85)",
              fontSize: "26px",
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ height: "1px", background: "rgba(255,255,255,0.08)" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div
            style={{
              fontSize: "12px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(180,220,255,0.75)",
            }}
          >
            About Diamond Animator
          </div>

          {/* Root menu buttons */}
          {menuView === "root" && (
            <>
              <button
                type="button"
onClick={() => {
  setMenuOpen(false);
  setAboutOpen(true);
}}
                style={{
                  textAlign: "left",
                  padding: "10px 10px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.85)",
                  fontSize: "13px",
                  lineHeight: 1.35,
                  cursor: "pointer",
                  appearance: "none",
                }}
              >
                Description
              </button>

              <button
                type="button"
                onClick={() => {
  setMenuOpen(false);
  setTermsOpen(true);
}}
                style={{
                  textAlign: "left",
                  padding: "10px 10px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.82)",
                  fontSize: "13px",
                  cursor: "pointer",
                  appearance: "none",
                }}
              >
                Terms of Policy
              </button>
            </>
          )}

          {/* About view */}
          {menuView === "about" && (
            <div
              style={{
                padding: "12px 12px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.035)",
                color: "rgba(255,255,255,0.86)",
                fontSize: "13px",
                lineHeight: 1.45,
              }}
            >
              <div style={{ fontWeight: 800, letterSpacing: "0.02em", marginBottom: 8 }}>
                Diamond Animator Pro
              </div>
              <div>
                Diamond Animator Pro is a high-focus animation workspace designed to dramatically reduce the time and effort required to create high-quality animations.
              </div>
              <div style={{ height: 10 }} />
              <div>
                Built for creators who want speed, power, and precision, Diamond Animator Pro integrates advanced AI assistance directly into the animation pipeline — helping transform what once took years of manual effort into streamlined production cycles measured in months, weeks, or even days.
              </div>
              <div style={{ height: 10 }} />
              <div style={{ fontWeight: 750, marginBottom: 6 }}>
                AI assistance can help you:
              </div>
              <ul style={{ margin: "0 0 0 18px", padding: 0 }}>
                <li>Assist in generating animation frames</li>
                <li>Help create visual effects</li>
                <li>Support scene refinement and enhancement</li>
                <li>Automate repetitive tasks</li>
                <li>Accelerate creative workflows</li>
              </ul>
              <div style={{ height: 10 }} />
              <div>
                Diamond Animator Pro is not about replacing creators — it’s about amplifying them. The AI works alongside you, assisting with heavy workloads and overnight processing to keep your creative momentum moving forward.
              </div>
              <div style={{ height: 14 }} />
              <div style={{ fontWeight: 750, marginBottom: 6 }}>
                Workspace add-ons
              </div>
              <div style={{ color: "rgba(255,255,255,0.78)" }}>
                Diamond Animator supports add-ons like plugins and packs, which let you extend your workspace with new tools and content.
              </div>
              <div style={{ height: 14 }} />
              <button
                type="button"
                onClick={() => setMenuView("root")}
                style={{
                  width: "100%",
                  padding: "10px 10px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.85)",
                  fontSize: "13px",
                  cursor: "pointer",
                  appearance: "none",
                }}
              >
                Back
              </button>
            </div>
          )}

          {/* Terms view */}
          {menuView === "terms" && (
            <div
              style={{
                padding: "12px 12px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.035)",
                color: "rgba(255,255,255,0.82)",
                fontSize: "13px",
                lineHeight: 1.45,
              }}
            >
              <div style={{ fontWeight: 800, letterSpacing: "0.02em", marginBottom: 8 }}>
                Terms of Policy
              </div>

              <div style={{ color: "rgba(255,255,255,0.86)" }}>
                <div style={{ fontWeight: 750, marginBottom: 6 }}>
                  Keep it creative.
                </div>
                <div style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.55 }}>
                  Diamond Animator is built to support ambitious creativity within clear safety standards. Use the workspace responsibly and keep your content safe for a broad audience.
                </div>
              </div>

              <div style={{ height: 12 }} />

              <div style={{ fontWeight: 750, marginBottom: 6, color: "rgba(255,255,255,0.90)" }}>
                What Diamond Animator is for
              </div>
              <div style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.55 }}>
                Diamond Animator is a creative workspace for making animations and visual stories — from stick-figure motion to hand-drawn scenes — with optional AI assistance to speed up your workflow.
              </div>

              <div style={{ height: 12 }} />

              <div style={{ fontWeight: 750, marginBottom: 6, color: "rgba(255,255,255,0.90)" }}>
                What you can create
              </div>
              <div style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.55 }}>
                You can create all kinds of original, positive content — including action, cartoon fighting, comedy, storytelling, education, and experiments with motion and effects.
                <br />
                <span style={{ color: "rgba(255,255,255,0.70)" }}>
                  (This list is not a limit — it’s just examples.)
                </span>
              </div>

              <div style={{ height: 12 }} />

              <div style={{ fontWeight: 750, marginBottom: 6, color: "rgba(255,255,255,0.90)" }}>
                What is not allowed
              </div>
              <ul style={{ margin: "0 0 0 18px", padding: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.55 }}>
                <li>
                  <b style={{ color: "rgba(255,255,255,0.88)" }}>Sexual content</b> — nudity or sexual acts are not allowed.
                </li>
                <li>
                  <b style={{ color: "rgba(255,255,255,0.88)" }}>Graphic violence / gore</b> — extreme injury, blood, or disturbing violence is not allowed.
                </li>
                <li>
                  <b style={{ color: "rgba(255,255,255,0.88)" }}>Teaching illegal or harmful actions</b> — content that instructs people how to do illegal, dangerous, or harmful things is not allowed.
                </li>
                <li>
                  <b style={{ color: "rgba(255,255,255,0.88)" }}>Self-harm encouragement</b> — content that encourages, promotes, or instructs self-harm is not allowed.
                </li>
              </ul>

              <div style={{ height: 12 }} />

              <div style={{ fontWeight: 750, marginBottom: 6, color: "rgba(255,255,255,0.90)" }}>
                How enforcement works
              </div>
              <div style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.55 }}>
                If something appears to break these rules, you may see a warning or your content may be restricted or removed. For serious violations (especially sexual content or extreme violence), removal may be immediate.
              </div>

              <div style={{ height: 12 }} />

              <div style={{ fontWeight: 750, marginBottom: 6, color: "rgba(255,255,255,0.90)" }}>
                In short
              </div>
              <div style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.55 }}>
                Create freely — just keep it safe, non-sexual, and non-graphic.
              </div>
              <div style={{ height: 14 }} />
              <button
                type="button"
                onClick={() => setMenuView("root")}
                style={{
                  width: "100%",
                  padding: "10px 10px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.85)",
                  fontSize: "13px",
                  cursor: "pointer",
                  appearance: "none",
                }}
              >
                Back
              </button>
            </div>
          )}
        </div>

        <div style={{ height: "1px", background: "rgba(255,255,255,0.08)", margin: "6px 0" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div
            style={{
              fontSize: "12px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.55)",
            }}
          >
            Support
          </div>

          <div
            style={{
              padding: "10px 10px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.85)",
              fontSize: "13px",
            }}
          >
            Report a Problem
          </div>
        </div>

        <div style={{ height: "18px" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div
            style={{
              fontSize: "12px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.55)",
            }}
          >
            Account
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div
              style={{
                padding: "10px 10px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.75)",
                fontSize: "13px",
              }}
            >
              Sign in
            </div>
            <div
              style={{
                padding: "10px 10px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.75)",
                fontSize: "13px",
              }}
            >
              Log in
            </div>
            <div
              style={{
                padding: "10px 10px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.75)",
                fontSize: "13px",
              }}
            >
              Sign out
            </div>
          </div>
        </div>
          </aside>
        </>
      )}

      {/* FULL SCREEN: ABOUT / DESCRIPTION */}
      {view === "home" && aboutOpen && (
        <div
          onClick={() => setAboutOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.42)",
            zIndex: 80,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "18px",
          }}
        >
          <div
            className="darkScroll"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(1100px, calc(100vw - 40px))",
              maxHeight: "calc(100vh - 40px)",
              overflowY: "scroll",
              overflowX: "hidden",
              borderRadius: "4px",
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(18,22,28,0.98)",
              boxShadow: "0 22px 70px rgba(0,0,0,0.50)",
              padding: "22px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div
                  style={{
                    fontSize: "12px",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(180,220,255,0.75)",
                  }}
                >
                  About Diamond Animator
                </div>
                <div style={{ fontSize: "26px", fontWeight: 750, color: "rgba(255,255,255,0.92)" }}>
                  Description
                </div>
              </div>

              <button
                aria-label="Close description"
                onClick={() => setAboutOpen(false)}
                style={{
                  appearance: "none",
                  border: "none",
                  background: "transparent",
                  padding: "6px 10px",
                  margin: 0,
                  color: "rgba(255,255,255,0.85)",
                  fontSize: "34px",
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ height: "14px" }} />

            <div
              style={{
                padding: "16px 16px",
                borderRadius: "4px",
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.84)",
                fontSize: "14px",
                lineHeight: 1.65,
              }}
            >
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: 800,
                  marginBottom: "10px",
                  color: "rgba(255,255,255,0.92)",
                }}
              >
                Diamond Animator Pro
              </div>

              <p style={{ marginTop: 0 }}>
                Diamond Animator Pro is a high-focus animation workspace designed to dramatically reduce the time and effort required to create high-quality animations.
              </p>

              <p>
                Built for creators who want speed, power, and precision, Diamond Animator Pro integrates advanced AI assistance directly into the animation pipeline — helping transform what once took years into months, months into weeks, and weeks into days.
              </p>

              <div
                style={{
                  fontWeight: 750,
                  marginTop: "14px",
                  marginBottom: "8px",
                  color: "rgba(255,255,255,0.90)",
                }}
              >
                AI assistance can help you with:
              </div>

              <ul style={{ marginTop: 0, paddingLeft: "18px" }}>
                <li>Assisting in generating animation frames</li>
                <li>Helping create visual effects</li>
                <li>Supporting scene refinement and enhancement</li>
                <li>Automating repetitive tasks</li>
                <li>Accelerating creative workflows</li>
                <li>Handling overnight processing for heavy workloads</li>
              </ul>

              <p style={{ marginBottom: 0 }}>
                Diamond Animator Pro is not about replacing creators — it’s about amplifying them. The AI works alongside you to keep your creative momentum moving forward.
              </p>

              <div style={{ height: 14 }} />
              <div style={{ fontWeight: 750, marginBottom: 6 }}>
                Workspace add-ons
              </div>
              <div style={{ color: "rgba(255,255,255,0.78)" }}>
                Diamond Animator is a developing platform that continues to improve over time. Through plugins and packs, creators will be able to extend their workspace with additional tools and creative enhancements as they become available.

                <br /><br />

                Some add-ons will be free, while others may offer more advanced capabilities for focused workflows. These expansions are designed to support creativity without disrupting the core experience of the workspace.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FULL SCREEN: TERMS OF POLICY */}
      {view === "home" && termsOpen && (
        <div
          onClick={() => setTermsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.42)",
            zIndex: 80,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "18px",
          }}
        >
          <div
            className="darkScroll"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(1100px, calc(100vw - 40px))",
              maxHeight: "calc(100vh - 40px)",
              overflow: "auto",
              borderRadius: "4px",
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(18,22,28,0.98)",
              boxShadow: "0 22px 70px rgba(0,0,0,0.50)",
              padding: "22px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {/* Removed upper label "About Diamond Animator" */}
                {/* <div
                  style={{
                    fontSize: "12px",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(180,220,255,0.75)",
                  }}
                >
                  About Diamond Animator
                </div> */}
                <div style={{ fontSize: "26px", fontWeight: 750, color: "rgba(255,255,255,0.92)" }}>
                  Terms of Policy
                </div>
              </div>

              <button
                aria-label="Close terms"
                onClick={() => setTermsOpen(false)}
                style={{
                  appearance: "none",
                  border: "none",
                  background: "transparent",
                  padding: "6px 10px",
                  margin: 0,
                  color: "rgba(255,255,255,0.85)",
                  fontSize: "34px",
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ height: "14px" }} />

            <div
              style={{
                padding: "16px 16px",
                borderRadius: "4px",
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.84)",
                fontSize: "14px",
                lineHeight: 1.65,
              }}
            >
              <div style={{ fontSize: "22px", fontWeight: 800, marginBottom: "10px" }}>
                Diamond Animator Pro
              </div>

              <div style={{ fontWeight: 750, marginBottom: 6 }}>
                1. Purpose of the Platform
              </div>
              <p>
                Diamond Animator Pro is a creative animation workspace designed for building original animated content using drawing tools, character systems, and AI assistance.
              </p>
              <p>
                The platform is built to support a wide range of creative styles — from action and storytelling to education, comedy, experimental animation, and beyond. You are not limited to specific genres or formats. Creativity is open-ended, as long as it stays within safe and responsible boundaries.
              </p>

              <div style={{ height: 16 }} />

              <div style={{ fontWeight: 750, marginBottom: 6 }}>
                2. Creative Freedom
              </div>
              <p>You are free to create original animated content of many kinds, including but not limited to:</p>
              <ul style={{ marginTop: 0, paddingLeft: "18px" }}>
                <li>Action scenes and stylized cartoon fighting (non-graphic)</li>
                <li>Story-driven animations</li>
                <li>Educational content</li>
                <li>Fictional worlds and characters</li>
                <li>Experimental or artistic projects</li>
                <li>Comedy and entertainment</li>
              </ul>
              <p>
                These are examples, not limits. Diamond Animator is designed to support imagination — not restrict it.
              </p>

              <div style={{ height: 16 }} />

              <div style={{ fontWeight: 750, marginBottom: 6 }}>
                3. Not Allowed Content
              </div>
              <ul style={{ marginTop: 0, paddingLeft: "18px" }}>
                <li>
                  <b>Sexual content of any kind</b> (including nudity, sexual acts, or explicit material). This may result in immediate removal.
                </li>
                <li>
                  <b>Graphic or extreme violence</b> (gore, torture, dismemberment, or disturbing violent detail).
                </li>
                <li>
                  <b>Teaching illegal or harmful activities</b> (content intended to show others how to perform unlawful or dangerous actions).
                </li>
                <li>
                  <b>Encouraging self-harm or harm toward others</b>.
                </li>
              </ul>
              <p>
                Diamond Animator is not a platform for content that promotes real-world harm.
              </p>

              <div style={{ height: 16 }} />

              <div style={{ fontWeight: 750, marginBottom: 6 }}>
                4. Enforcement
              </div>
              <ul style={{ marginTop: 0, paddingLeft: "18px" }}>
                <li>A warning may appear stating the content may violate policy.</li>
                <li>Some content may be blocked or restricted.</li>
                <li>Severe violations may result in immediate removal.</li>
              </ul>

              <div style={{ height: 16 }} />

              <div style={{ fontWeight: 750, marginBottom: 6 }}>
                5. Keep It Creative
              </div>
              <p>
                Diamond Animator is built to support ambitious creativity within clear safety standards. Users are expected to use the platform responsibly and in alignment with these guidelines.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MAIN HOME */}
      {view === "home" && (
        
   <main
  style={{
    flex: 1,
    background: "rgb(26, 27, 36)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "30px 20px 60px 20px",
    gap: "50px",
    overflowY: "auto", // IMPORTANT: scrollbar belongs to main, not the page
    overflowX: "hidden",
  }}
>
          {/* WORKSPACE */}
          <section
            style={{
              width: "100%",
              maxWidth: "900px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "34px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  margin: 0,
                  color: "rgba(255,255,255,0.60)",
                }}
              >
                Workspace
              </h2>
              <div
                style={{
                  width: "760px",
                  maxWidth: "calc(100vw - 80px)",
                  height: "1px",
                  background: "rgba(255,255,255,0.10)",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "17px",
                alignItems: "center",
                width: "100%",
                marginTop: "8px",
                paddingRight: "0px",
              }}
            >
              <div style={{ ...cardOuterStyle, display: "flex", flexDirection: "column", gap: "17px" }}>
                <button
                  onClick={(e) => {
                    // Prevent the button from looking “stuck” when returning
                    (e.currentTarget as HTMLButtonElement).blur();
                    setHoveredCard(null);
                    setNewProjectBackHover(false);
                    setView("newProject");
                  }}
                  onMouseEnter={() => setHoveredCard("new")}
                  onMouseLeave={() => setHoveredCard(null)}
                  style={cardStyle(hoveredCard === "new")}
                >
                  <div style={{ ...cardInnerRowStyle, transform: "translateX(-18px)" }}>
                    <div
                      aria-hidden="true"
                      style={{
                        fontSize: "30px",
                        fontWeight: 900,
                        lineHeight: 1,
                        color: "rgba(255,255,255,0.95)",
                        transform: "translateY(-2px)",
                        userSelect: "none",
                        marginLeft: "-8px",
                      }}
                    >
                      +
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ fontWeight: 600, letterSpacing: "0.01em", fontSize: "18px", lineHeight: 1.1 }}>
                        New Project
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          lineHeight: 1.25,
                          color: "rgba(255,255,255,0.55)",
                          userSelect: "none",
                        }}
                      >
                        Create a new project.
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              <div style={cardOuterStyle}>
                <button
                  onMouseEnter={() => setHoveredCard("open")}
                  onMouseLeave={() => setHoveredCard(null)}
                  style={cardStyle(hoveredCard === "open")}
                >
                  <div
                    style={{
                      ...cardInnerRowStyle,
                      // keep transform: "translateX(-28px)" as requested
                    }}
                  >
                    {/* Left paper icon */}
                    <div
                      aria-hidden="true"
                      style={{
                        width: "34px",
                        height: "34px",
                        background: "rgba(255,255,255,0.95)",
                        borderRadius: "2px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-start",
                        padding: "4px",
                        boxSizing: "border-box",
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          height: "2px",
                          borderRadius: "2px",
                          background: "rgba(0,0,0,0.55)",
                          width: "82%",
                          marginTop: "0px",
                          marginBottom: "3px",
                        }}
                      />
                      <div
                        style={{
                          height: "2px",
                          borderRadius: "2px",
                          background: "rgba(0,0,0,0.42)",
                          width: "88%",
                          marginBottom: "3px",
                        }}
                      />
                      <div
                        style={{
                          height: "2px",
                          borderRadius: "2px",
                          background: "rgba(0,0,0,0.34)",
                          width: "74%",
                          marginTop: "0px",
                        }}
                      />
                    </div>

                    {/* Right text */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ fontWeight: 600, letterSpacing: "0.01em", fontSize: "18px", lineHeight: 1.1 }}>
                        Open Project
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          lineHeight: 1.25,
                          color: "rgba(255,255,255,0.55)",
                          userSelect: "none",
                        }}
                      >
                        Open an existing project.
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              {/* LEARN */}
              <div style={{ height: "26px" }} />

              {/* Centered Learn header like Workspace */}
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "34px",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.60)",
                    }}
                  >
                    Learn
                  </div>
                  <div
                    style={{
                      width: "760px",
                      maxWidth: "calc(100vw - 80px)",
                      height: "1px",
                      background: "rgba(255,255,255,0.10)",
                    }}
                  />
                </div>

                {/* Learn buttons */}
                <div
                  style={{
                    ...cardOuterStyle,
                    display: "flex",
                    flexDirection: "column",
                    gap: "17px",
                    marginTop: "8px",
                  }}
                >
                  <button
                    type="button"
                    onMouseEnter={() => setHoveredCard("tutorials")}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={cardStyle(hoveredCard === "tutorials")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "18px", transform: "translateX(-34px)" }}>
                      {/* Left play icon */}
                      <div
                        aria-hidden="true"
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "6px",
                          background: "rgba(255,255,255,0.96)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: 0,
                            height: 0,
                            borderTop: "7px solid transparent",
                            borderBottom: "7px solid transparent",
                            borderLeft: "12px solid rgb(35,36,44)",
                            transform: "translateX(1px)",
                          }}
                        />
                      </div>

                      {/* Right text */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ fontWeight: 600, letterSpacing: "0.01em", fontSize: "18px", lineHeight: 1.1 }}>
                          Tutorials
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            lineHeight: 1.25,
                            color: "rgba(255,255,255,0.55)",
                            userSelect: "none",
                          }}
                        >
                          Learn the app and animation fundamentals.
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onMouseEnter={() => setHoveredCard("assistant")}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={cardStyle(hoveredCard === "assistant")}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "18px",
                        transform: "translateX(-34px)",
                      }}
                    >
                      {/* Left robot icon */}
                      <div
                        aria-hidden="true"
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "5px",
                          background: "transparent",
                          border: "1px solid rgba(70, 120, 210, 0.45)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          position: "relative",
                          boxSizing: "border-box",
                          transform: "translateY(4px)",
                        }}
                      >
                        {/* antenna */}
                        <div
                          style={{
                            position: "absolute",
                            top: "-11px",
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: "2px",
                            height: "11px",
                            borderRadius: "2px",
                            background: "rgba(77, 163, 255, 0.85)",
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            top: "-13px",
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: "6px",
                            height: "6px",
                            borderRadius: "999px",
                            background: "rgb(77, 163, 255)",
                          }}
                        />
                        {/* eyes */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                            transform: "translateY(-3px)",
                          }}
                        >
                          <div
                            style={{
                              width: "4px",
                              height: "4px",
                              borderRadius: "999px",
                              background: "rgba(77, 163, 255, 0.85)",
                            }}
                          />
                          <div
                            style={{
                              width: "4px",
                              height: "4px",
                              borderRadius: "999px",
                              background: "rgba(77, 163, 255, 0.85)",
                            }}
                          />
                        </div>
                      </div>

                      {/* Right text */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ fontWeight: 600, letterSpacing: "0.01em", fontSize: "18px", lineHeight: 1.1 }}>
                          AI Assistant
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            lineHeight: 1.25,
                            color: "rgba(255,255,255,0.55)",
                            userSelect: "none",
                          }}
                        >
                          Ask questions and get guidance.
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* TOOLS */}
              <div style={{ height: "18px" }} />
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "34px",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.60)",
                    }}
                  >
                    Tools
                  </div>
                  <div
                    style={{
                      width: "760px",
                      maxWidth: "calc(100vw - 80px)",
                      height: "1px",
                      background: "rgba(255,255,255,0.10)",
                    }}
                  />
                </div>

                <div
                  style={{
                    ...cardOuterStyle,
                    display: "flex",
                    flexDirection: "column",
                    gap: "17px",
                    marginTop: "8px",
                  }}
                >
                  <button
                    type="button"
                    onMouseEnter={() => setHoveredCard("export")}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={cardStyle(hoveredCard === "export")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "18px", transform: "translateX(-34px)" }}>
                      {/* Left export icon (arrow leaving a square) */}
                      <div
                        aria-hidden="true"
                        style={{
                          width: "34px",
                          height: "34px",
                          background: "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          position: "relative",
                          boxSizing: "border-box",
                        }}
                      >
                        {/* vertical arrow shaft */}
                        <div
                          style={{
                            position: "absolute",
                            width: "16px",
                            height: "26px",
                            borderRadius: "2px",
                            background: "rgb(255,255,255)",
                            bottom: "0px",
                            left: "50%",
                            transform: "translateX(-50%)",
                          }}
                        />

                        {/* arrow head */}
                        <div
                          style={{
                            position: "absolute",
                            width: 0,
                            height: 0,
                            borderLeft: "16px solid transparent",
                            borderRight: "16px solid transparent",
                            borderBottom: "18px solid rgb(255,255,255)",
                            top: "-4px",
                            left: "50%",
                            transform: "translateX(-50%)",
                          }}
                        />
                      </div>

                      {/* Right text */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ fontWeight: 600, letterSpacing: "0.01em", fontSize: "18px", lineHeight: 1.1 }}>
                          Export
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            lineHeight: 1.25,
                            color: "rgba(255,255,255,0.55)",
                            userSelect: "none",
                          }}
                        >
                          Export your animation.
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onMouseEnter={() => setHoveredCard("aiProject")}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={cardStyle(hoveredCard === "aiProject")}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "18px",
                        transform: "translateX(-34px)",
                      }}
                    >
                      {/* Left robot + paper badge icon */}
                      <div
                        aria-hidden="true"
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "5px",
                          background: "transparent",
                          border: "1px solid rgba(70, 120, 210, 0.45)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          position: "relative",
                          boxSizing: "border-box",
                          transform: "translateY(4px)",
                        }}
                      >
                        {/* antenna */}
                        <div
                          style={{
                            position: "absolute",
                            top: "-11px",
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: "2px",
                            height: "11px",
                            borderRadius: "2px",
                            background: "rgba(77, 163, 255, 0.85)",
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            top: "-13px",
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: "6px",
                            height: "6px",
                            borderRadius: "999px",
                            background: "rgb(77, 163, 255)",
                          }}
                        />

                        {/* eyes */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                            transform: "translateY(-3px)",
                          }}
                        >
                          <div
                            style={{
                              width: "4px",
                              height: "4px",
                              borderRadius: "999px",
                              background: "rgba(77, 163, 255, 0.85)",
                            }}
                          />
                          <div
                            style={{
                              width: "4px",
                              height: "4px",
                              borderRadius: "999px",
                              background: "rgba(77, 163, 255, 0.85)",
                            }}
                          />
                        </div>

                        {/* paper badge (bottom-right) */}
                        <div
                          style={{
                            position: "absolute",
                            right: "-5px",
                            bottom: "-5px",
                            width: "14px",
                            height: "14px",
                            background: "rgba(255,255,255,0.95)",
                            borderRadius: "2px",
                            boxSizing: "border-box",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "flex-start",
                            padding: "2px",
                            gap: "2px",
                          }}
                        >
                          <div
                            style={{
                              height: "2px",
                              borderRadius: "2px",
                              background: "rgba(0,0,0,0.55)",
                              width: "82%",
                            }}
                          />
                          <div
                            style={{
                              height: "2px",
                              borderRadius: "2px",
                              background: "rgba(0,0,0,0.42)",
                              width: "88%",
                            }}
                          />
                          <div
                            style={{
                              height: "2px",
                              borderRadius: "2px",
                              background: "rgba(0,0,0,0.34)",
                              width: "74%",
                            }}
                          />
                        </div>
                      </div>

                      {/* Right text */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ fontWeight: 600, letterSpacing: "0.01em", fontSize: "18px", lineHeight: 1.1 }}>
                          AI Project Assistance
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            lineHeight: 1.25,
                            color: "rgba(255,255,255,0.55)",
                            userSelect: "none",
                          }}
                        >
                          Apply final AI touches to your project.
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onMouseEnter={() => setHoveredCard("addons")}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={cardStyle(hoveredCard === "addons")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "18px", transform: "translateX(-34px)" }}>
                      {/* Left add-ons icon (modules grid) */}
                      <div
                        aria-hidden="true"
                        style={{
                          width: "34px",
                          height: "34px",
                          background: "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          position: "relative",
                          boxSizing: "border-box",
                        }}
                      >
                        <div
                     style={{
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gridTemplateRows: "repeat(2, 1fr)",
  gap: "5px",
  width: "30px",
  height: "30px",
}}
                        >
                          <div style={{ border: "2px solid rgba(255,255,255,0.95)", borderRadius: "3px" }} />
                          <div style={{ border: "2px solid rgba(255,255,255,0.95)", borderRadius: "3px" }} />
                          <div style={{ border: "2px solid rgba(255,255,255,0.95)", borderRadius: "3px" }} />
                          <div style={{ border: "2px solid rgba(255,255,255,0.95)", borderRadius: "3px" }} />
                        </div>
                      </div>

                      {/* Right text */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ fontWeight: 600, letterSpacing: "0.01em", fontSize: "18px", lineHeight: 1.1 }}>
                          Add-ons
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            lineHeight: 1.25,
                            color: "rgba(255,255,255,0.55)",
                            userSelect: "none",
                          }}
                        >
                          Extend your workspace with new tools and upgrades.
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}
{/* NEW PROJECT SCREEN */}
{view === "newProject" && (
  <div
    style={{
      minHeight: "100vh",
background: "rgb(26, 27, 36)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "40px 20px 80px 20px",
      gap: "26px",
      position: "relative",
    }}
  >
    {/* Back button (top-left) */}
    <button
      type="button"
      onClick={(e) => {
        (e.currentTarget as HTMLButtonElement).blur();
        setHoveredCard(null);
        setNewProjectBackHover(false);
        setView("home");
      }}
      onMouseEnter={() => setNewProjectBackHover(true)}
      onMouseLeave={() => setNewProjectBackHover(false)}
      onBlur={() => setNewProjectBackHover(false)}
      style={{
        position: "absolute",
        top: 22,
        left: 22,
        padding: "10px 12px",
        borderRadius: "10px",
        border: newProjectBackHover
          ? "1px solid rgba(255,255,255,0.28)"
          : "1px solid rgba(255,255,255,0.15)",
        background: newProjectBackHover ? "rgba(255,255,255,0.085)" : "rgba(255,255,255,0.05)",
        boxShadow: newProjectBackHover
          ? "0 0 14px rgba(255,255,255,0.10), 0 8px 18px rgba(0,0,0,0.28)"
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

    {/* Page header stack */}
    <div
      style={{
        width: "min(920px, calc(100vw - 40px))",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginTop: "34px",
        gap: "10px",
      }}
    >
      <div
        style={{
          fontSize: "12px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(180,220,255,0.75)",
        }}
      >
        New Project
      </div>
      <div style={{ color: "rgba(255,255,255,0.92)", fontSize: "32px", fontWeight: 800 }}>
        Create a new project
      </div>
      <div style={{ color: "rgba(255,255,255,0.62)", fontSize: "14px", marginTop: "2px" }}>
        What would you like to create?
      </div>
      <div
        style={{
          width: "760px",
          maxWidth: "calc(100vw - 80px)",
          height: "1px",
          background: "rgba(255,255,255,0.10)",
          marginTop: "14px",
        }}
      />
    </div>

    <div
      style={{
        display: "flex",
        gap: "24px",
        marginTop: "10px",
        width: "min(920px, calc(100vw - 40px))",
        justifyContent: "center",
        flexWrap: "wrap",
      }}
    >
      {/* DRAWING */}
      <button
        type="button"
        onClick={(e) => {
          (e.currentTarget as HTMLButtonElement).blur();
          setView("drawingWorkspace");
        }}
        style={{
          width: "360px",
          height: "170px",
          borderRadius: "12px",
          border: "1px solid rgba(70, 120, 210, 0.30)",
          background: "rgba(255,255,255,0.04)",
          color: "white",
          padding: "20px",
          textAlign: "left",
          cursor: "pointer",
          outline: "none",
          transition: "transform 240ms ease, border-color 160ms ease, background 160ms ease",
        }}
      >
        <div style={{ fontSize: "18px", fontWeight: 700 }}>
          Drawing Animation
        </div>

        <div
          style={{
            fontSize: "13px",
            color: "rgba(255,255,255,0.60)",
            marginTop: "6px",
          }}
        >
          Create hand-drawn animations.
        </div>
      </button>

      {/* STICK FIGURES */}
      <button
        style={{
          width: "360px",
          height: "170px",
          borderRadius: "12px",
          border: "1px solid rgba(70, 120, 210, 0.30)",
          background: "rgba(255,255,255,0.04)",
          color: "white",
          padding: "20px",
          textAlign: "left",
          cursor: "pointer",
          transition: "transform 240ms ease, border-color 160ms ease, background 160ms ease",
        }}
      >
        <div style={{ fontSize: "18px", fontWeight: 700 }}>
          Stick Figure Animation
        </div>

        <div
          style={{
            fontSize: "13px",
            color: "rgba(255,255,255,0.60)",
            marginTop: "6px",
          }}
        >
          Animate stick figure characters.
        </div>
      </button>
    </div>
    {/* Future modes hint */}
    <div
      style={{
        marginTop: "auto",
        marginBottom: "-66px",
        fontSize: "12px",
        color: "rgba(180,220,255,0.45)",
        textAlign: "center",
        letterSpacing: "0.02em",
        userSelect: "none",
      }}
    >
      Additional creation modes may appear here in future updates.
    </div>
  </div>
)} {/* DRAWING WORKSPACE (layout only) */}
{view === "drawingWorkspace" && <DrawingWorkspace />}
    </div>
  );
}
