"use client";

import { AppChrome as MainScreenHeader } from "@/src/components/chrome/AIcreditspage";
import { OpenProjectBrowser } from "@/src/components/open-project/OpenProjectBrowser";
import { DrawingWorkspace } from "@/src/components/workspace/DrawingWorkspace";
import { StickFigureCreatorWorkspace } from "@/src/components/workspace/stickfigure/StickFigureCreatorWorkspace";
import { StickFigureWorkspace } from "@/src/components/workspace/stickfigure/StickFigureWorkspace";
import type { DrawingProjectOpenCandidate } from "@/src/lib/drawingProjectStorage";
import type { StickSavedProjectRecordV1 } from "@/src/lib/stickProjectStorage";
import { useEffect, useRef, useState } from "react";

type HomeCardId = "new" | "open" | "myProject" | "tutorials" | "assistant" | "export" | "aiProject" | "aiCredits";

export default function Page() {
  const [view, setView] = useState<
    "home" | "openProject" | "newProject" | "drawingWorkspace" | "stickFigureWorkspace" | "stickFigureCreatorWorkspace"
  >("home");
  const [newProjectBackHover, setNewProjectBackHover] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeStep, setWelcomeStep] = useState<0 | 1>(0);
  const [guidedChoices, setGuidedChoices] = useState<string[]>([]);
  const [activeDrawingProject, setActiveDrawingProject] = useState<DrawingProjectOpenCandidate | null>(null);
  const [activeStickProject, setActiveStickProject] = useState<StickSavedProjectRecordV1 | null>(null);
  const [hoveredCard, setHoveredCard] = useState<HomeCardId | null>(null);
  const homeMainRef = useRef<HTMLElement | null>(null);
  const homeScrollHideTimeoutRef = useRef<number | null>(null);
  const CARD_W = "656px";
  const CARD_MAX_W = "calc(100vw - 64px)";
  const homeRootBackground =
    "linear-gradient(180deg, #060f18 0%, #08111b 44%, #09131d 100%)";
  const homeMainBackground =
    "linear-gradient(180deg, rgba(9,14,23,0.99) 0%, rgba(10,15,25,0.99) 48%, rgba(8,13,22,1) 100%)";
  const homeSectionHeadingColor = "rgba(176, 190, 212, 0.74)";
  const homeDividerBackground =
    "linear-gradient(90deg, rgba(100, 120, 151, 0) 0%, rgba(96, 116, 147, 0.14) 22%, rgba(114, 136, 169, 0.23) 50%, rgba(96, 116, 147, 0.14) 78%, rgba(100, 120, 151, 0) 100%)";
  const homeCardBodyColor = "rgba(174, 186, 204, 0.72)";

  const cardStyle = (isHover: boolean) =>
    ({
      padding: "25px 58px",
      borderRadius: "14px",
      border: isHover ? "1px solid rgba(64, 142, 255, 0.78)" : "1px solid rgba(104, 123, 154, 0.38)",
      background: isHover
        ? "linear-gradient(180deg, rgba(13,39,74,0.99) 0%, rgba(8,28,57,0.97) 100%)"
        : "linear-gradient(180deg, rgba(16,24,38,0.97) 0%, rgba(13,20,34,0.97) 100%)",
      color: "white",
      cursor: "pointer",
      outline: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      textAlign: "left" as const,
      width: "100%",
      transition: "transform 240ms ease, border-color 160ms ease, background 160ms ease, box-shadow 180ms ease",
      transform: isHover ? "translateY(-1px)" : "translateY(0)",
      boxShadow: isHover
        ? "0 18px 30px rgba(1,7,18,0.34), 0 0 0 1px rgba(64,142,255,0.18), 0 0 20px rgba(18,96,194,0.14)"
        : "0 16px 28px rgba(1,7,18,0.22)",
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

  const backButtonStyle = (isHover: boolean) =>
    ({
      position: "absolute",
      top: 22,
      left: 22,
      padding: "10px 12px",
      borderRadius: "10px",
      border: isHover ? "1px solid rgba(64,142,255,0.58)" : "1px solid rgba(255,255,255,0.15)",
      background: isHover ? "rgba(12,45,86,0.42)" : "rgba(255,255,255,0.05)",
      boxShadow: isHover ? "0 0 14px rgba(22,96,194,0.16), 0 8px 18px rgba(0,0,0,0.28)" : "none",
      color: "rgba(255,255,255,0.88)",
      fontSize: "13px",
      cursor: "pointer",
      outline: "none",
      appearance: "none",
      transition: "all 160ms ease",
    } as const);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setWelcomeOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    // First-time welcome (client-only)
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      try {
        const never = localStorage.getItem("da_welcome_never_show") === "1";
        const seen = localStorage.getItem("da_welcome_seen") === "1";
        if (!cancelled && !never && !seen) {
          setWelcomeStep(0);
          setWelcomeOpen(true);
        }
      } catch {
        // ignore
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);
  useEffect(() => {
    // Prevent stale hover/focus state when switching screens
    if (view === "home") return;
    const timeoutId = window.setTimeout(() => setHoveredCard(null), 0);
    return () => window.clearTimeout(timeoutId);
  }, [view]);

  useEffect(() => {
    // Fix: New Project back button hover can get "stuck" if we switch views while hovered.
    if (view === "newProject") return;
    const timeoutId = window.setTimeout(() => setNewProjectBackHover(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [view]);

  useEffect(() => {
    if (view !== "home") return;

    const main = homeMainRef.current;
    if (!main) {
      return;
    }

    const handleScroll = () => {
      main.classList.add("is-scroll-active");
      if (homeScrollHideTimeoutRef.current !== null) {
        window.clearTimeout(homeScrollHideTimeoutRef.current);
      }
      homeScrollHideTimeoutRef.current = window.setTimeout(() => {
        main.classList.remove("is-scroll-active");
        homeScrollHideTimeoutRef.current = null;
      }, 350);
    };

    main.classList.remove("is-scroll-active");
    main.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      main.removeEventListener("scroll", handleScroll);
      main.classList.remove("is-scroll-active");
      if (homeScrollHideTimeoutRef.current !== null) {
        window.clearTimeout(homeScrollHideTimeoutRef.current);
        homeScrollHideTimeoutRef.current = null;
      }
    };
  }, [view]);

  const toggleGuidedChoice = (key: string) => {
    setGuidedChoices((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
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
    background: view === "home" ? homeRootBackground : "rgb(26, 27, 36)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden", // IMPORTANT: keep page scrollbar from being on <body>
  }}
>
      {view === "home" && <MainScreenHeader theme="home" />}

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
      aria-label="Welcome to Diamond Animator"
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
        {welcomeStep === 0 ? "Welcome to Diamond Animator" : "Choose your guided setup"}
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
        Welcome to Diamond Animator. Would you like a guided setup?
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
          Don&apos;t show again
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
          Don&apos;t show again
        </button>
      </div>
    </>
  )}
    </div>
  </>
)}

      {/* MAIN HOME */}
      {view === "home" && (

<main
  ref={homeMainRef}
  className="home-main-scroll"
  style={{
    flex: 1,
    background: homeMainBackground,
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
                  color: homeSectionHeadingColor,
                }}
              >
                Workspace
              </h2>
              <div
                style={{
                  width: "800px",
                  maxWidth: "calc(100vw - 64px)",
                  height: "1px",
                  background: homeDividerBackground,
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "24px",
                alignItems: "center",
                width: "100%",
                marginTop: "8px",
                paddingRight: "0px",
              }}
            >
              <div style={{ ...cardOuterStyle, display: "flex", flexDirection: "column", gap: "24px" }}>
                <button
                  onClick={(e) => {
                    // Prevent the button from looking “stuck” when returning
                    (e.currentTarget as HTMLButtonElement).blur();
                    setHoveredCard(null);
                    setNewProjectBackHover(false);
                    setActiveDrawingProject(null);
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
                        fontSize: "34px",
                        fontWeight: 900,
                        lineHeight: 1,
                        color: "rgba(255,255,255,0.95)",
                        transform: "translateY(-2px) scale(1.08)",
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
                          color: homeCardBodyColor,
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
                  onClick={(e) => {
                    (e.currentTarget as HTMLButtonElement).blur();
                    setHoveredCard(null);
                    setView("openProject");
                  }}
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
                        transform: "scale(1.1)",
                        transformOrigin: "center",
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
                          color: homeCardBodyColor,
                          userSelect: "none",
                        }}
                      >
                        Open an existing project.
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              <div style={cardOuterStyle}>
                <button
                  type="button"
                  onMouseEnter={() => setHoveredCard("myProject")}
                  onMouseLeave={() => setHoveredCard(null)}
                  style={cardStyle(hoveredCard === "myProject")}
                >
                  <div style={cardInnerRowStyle}>
                    <div
                      aria-hidden="true"
                      style={{
                        width: "42px",
                        height: "42px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        transform: "scale(1.1)",
                        transformOrigin: "center",
                      }}
                    >
                      <svg
                        viewBox="0 0 34 34"
                        fill="none"
                        style={{ width: "42px", height: "42px" }}
                      >
                        <rect
                          x="0.6"
                          y="5.35"
                          width="32.8"
                          height="23.1"
                          rx="1.45"
                          stroke="rgba(255,255,255,0.94)"
                          strokeWidth="2.2"
                        />
                        <rect x="2.95" y="8.1" width="2.9" height="3.3" rx="0.45" fill="rgba(255,255,255,0.94)" />
                        <rect x="2.95" y="15.2" width="2.9" height="3.3" rx="0.45" fill="rgba(255,255,255,0.94)" />
                        <rect x="2.95" y="22.3" width="2.9" height="3.3" rx="0.45" fill="rgba(255,255,255,0.94)" />
                        <rect x="28.15" y="8.1" width="2.9" height="3.3" rx="0.45" fill="rgba(255,255,255,0.94)" />
                        <rect x="28.15" y="15.2" width="2.9" height="3.3" rx="0.45" fill="rgba(255,255,255,0.94)" />
                        <rect x="28.15" y="22.3" width="2.9" height="3.3" rx="0.45" fill="rgba(255,255,255,0.94)" />
                        <rect
                          x="9.95"
                          y="10.35"
                          width="14.1"
                          height="13.3"
                          rx="1.3"
                          stroke="rgba(255,255,255,0.82)"
                          strokeWidth="1.85"
                        />
                        <path
                          d="M14.9 13.7 20.85 17 14.9 20.3Z"
                          fill="rgba(255,255,255,0.94)"
                        />
                      </svg>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ fontWeight: 600, letterSpacing: "0.01em", fontSize: "18px", lineHeight: 1.1 }}>
                        My Project
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          lineHeight: 1.25,
                          color: homeCardBodyColor,
                          userSelect: "none",
                        }}
                      >
                        View your created projects.
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
                      color: homeSectionHeadingColor,
                    }}
                  >
                    Learn
                  </div>
                  <div
                    style={{
                  width: "800px",
                  maxWidth: "calc(100vw - 64px)",
                      height: "1px",
                      background: homeDividerBackground,
                    }}
                  />
                </div>

                {/* Learn buttons */}
                <div
                  style={{
                    ...cardOuterStyle,
                    display: "flex",
                    flexDirection: "column",
                    gap: "24px",
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
                          transform: "scale(1.1)",
                          transformOrigin: "center",
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
                            color: homeCardBodyColor,
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
                          width: "34px",
                          height: "34px",
                          background: "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          boxSizing: "border-box",
                          transform: "translateY(1px)",
                          overflow: "visible",
                        }}
                      >
                        <svg
                          viewBox="0 0 34 34"
                          fill="none"
                          style={{ width: "34px", height: "34px", transform: "scale(1.78)", transformOrigin: "center", overflow: "visible" }}
                        >
                          <path
                            d="M17.55 10.2L17.55 8.15L15.75 6.55L17.55 5.05L17.55 2.45"
                            stroke="rgba(77, 163, 255, 1)"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle cx="17.55" cy="1.15" r="2.15" fill="rgba(77, 163, 255, 1)" />
                          <rect
                            x="7.4"
                            y="10.6"
                            width="19.2"
                            height="15.6"
                            rx="4.2"
                            fill="none"
                            stroke="rgba(77, 163, 255, 1)"
                            strokeWidth="2.05"
                          />
                          <path
                            d="M7.4 16.45H4.45"
                            stroke="rgba(77, 163, 255, 1)"
                            strokeWidth="2.05"
                            strokeLinecap="round"
                          />
                          <path
                            d="M29.55 16.45H26.6"
                            stroke="rgba(77, 163, 255, 1)"
                            strokeWidth="2.05"
                            strokeLinecap="round"
                          />
                          <ellipse cx="13.5" cy="17.5" rx="1.7" ry="2.05" fill="rgba(77, 163, 255, 1)" />
                          <ellipse cx="20.5" cy="17.5" rx="1.7" ry="2.05" fill="rgba(77, 163, 255, 1)" />
                        </svg>
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
                            color: homeCardBodyColor,
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
                      color: homeSectionHeadingColor,
                    }}
                  >
                    Tools
                  </div>
                  <div
                    style={{
                      width: "800px",
                      maxWidth: "calc(100vw - 64px)",
                      height: "1px",
                      background: homeDividerBackground,
                    }}
                  />
                </div>

                <div
                  style={{
                    ...cardOuterStyle,
                    display: "flex",
                    flexDirection: "column",
                    gap: "24px",
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
                          transform: "scale(1.1)",
                          transformOrigin: "center",
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
                            color: homeCardBodyColor,
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
                          width: "34px",
                          height: "34px",
                          background: "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          position: "relative",
                          boxSizing: "border-box",
                          transform: "translateY(1px)",
                          overflow: "visible",
                        }}
                      >
                        <svg
                          viewBox="0 0 34 34"
                          fill="none"
                          style={{ width: "34px", height: "34px", transform: "scale(1.78)", transformOrigin: "center", overflow: "visible" }}
                        >
                          <path
                            d="M17.55 10.2L17.55 8.15L15.75 6.55L17.55 5.05L17.55 2.45"
                            stroke="rgba(77, 163, 255, 1)"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle cx="17.55" cy="1.15" r="2.15" fill="rgba(77, 163, 255, 1)" />
                          <rect
                            x="7.4"
                            y="10.6"
                            width="19.2"
                            height="15.6"
                            rx="4.2"
                            fill="none"
                            stroke="rgba(77, 163, 255, 1)"
                            strokeWidth="2.05"
                          />
                          <path
                            d="M7.4 16.45H4.45"
                            stroke="rgba(77, 163, 255, 1)"
                            strokeWidth="2.05"
                            strokeLinecap="round"
                          />
                          <path
                            d="M29.55 16.45H26.6"
                            stroke="rgba(77, 163, 255, 1)"
                            strokeWidth="2.05"
                            strokeLinecap="round"
                          />
                          <ellipse cx="13.5" cy="17.5" rx="1.7" ry="2.05" fill="rgba(77, 163, 255, 1)" />
                          <ellipse cx="20.5" cy="17.5" rx="1.7" ry="2.05" fill="rgba(77, 163, 255, 1)" />
                        </svg>

                        {/* paper badge (bottom-right) */}
                        <div
                          style={{
                            position: "absolute",
                            right: "-1px",
                            bottom: "1px",
                            width: "12px",
                            height: "13px",
                            background: "rgba(255,255,255,0.95)",
                            borderRadius: "2px",
                            border: "1px solid rgba(15, 20, 29, 0.20)",
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
                              background: "rgba(25,31,42,0.56)",
                              width: "84%",
                            }}
                          />
                          <div
                            style={{
                              height: "2px",
                              borderRadius: "2px",
                              background: "rgba(25,31,42,0.42)",
                              width: "92%",
                            }}
                          />
                          <div
                            style={{
                              height: "2px",
                              borderRadius: "2px",
                              background: "rgba(25,31,42,0.32)",
                              width: "70%",
                            }}
                          />
                        </div>
                      </div>

                      {/* Right text */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ fontWeight: 600, letterSpacing: "0.01em", fontSize: "18px", lineHeight: 1.1 }}>
                          AI Project Finalizer
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            lineHeight: 1.25,
                            color: homeCardBodyColor,
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
                    onMouseEnter={() => setHoveredCard("aiCredits")}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={cardStyle(hoveredCard === "aiCredits")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "18px", transform: "translateX(-34px)" }}>
                      <div
                        aria-hidden="true"
                        style={{
                          width: "42px",
                          height: "42px",
                          background: "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          boxSizing: "border-box",
                          transform: "scale(1.1)",
                          transformOrigin: "center",
                        }}
                      >
                        <svg
                          viewBox="0 0 34 34"
                          fill="none"
                          style={{ width: "42px", height: "42px" }}
                        >
                          <circle
                            cx="17"
                            cy="17"
                            r="12.1"
                            stroke="rgba(255,255,255,0.94)"
                            strokeWidth="2.05"
                          />
                          <line x1="5.31" y1="13.87" x2="7.63" y2="14.49" stroke="rgba(255,255,255,0.94)" strokeWidth="1.9" strokeLinecap="round" />
                          <line x1="8.44" y1="8.44" x2="10.14" y2="10.14" stroke="rgba(255,255,255,0.94)" strokeWidth="1.9" strokeLinecap="round" />
                          <line x1="13.87" y1="5.31" x2="14.49" y2="7.63" stroke="rgba(255,255,255,0.94)" strokeWidth="1.9" strokeLinecap="round" />
                          <line x1="20.13" y1="5.31" x2="19.51" y2="7.63" stroke="rgba(255,255,255,0.94)" strokeWidth="1.9" strokeLinecap="round" />
                          <line x1="25.56" y1="8.44" x2="23.86" y2="10.14" stroke="rgba(255,255,255,0.94)" strokeWidth="1.9" strokeLinecap="round" />
                          <line x1="28.69" y1="13.87" x2="26.37" y2="14.49" stroke="rgba(255,255,255,0.94)" strokeWidth="1.9" strokeLinecap="round" />
                          <line
                            x1="17"
                            y1="17"
                            x2="24.55"
                            y2="11.79"
                            stroke="rgba(77, 163, 255, 0.96)"
                            strokeWidth="2.35"
                            strokeLinecap="round"
                          />
                          <circle cx="17" cy="17" r="2.45" fill="rgba(255,255,255,0.94)" />
                        </svg>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ fontWeight: 600, letterSpacing: "0.01em", fontSize: "18px", lineHeight: 1.1 }}>
                          AI Credits
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            lineHeight: 1.25,
                            color: homeCardBodyColor,
                            userSelect: "none",
                          }}
                        >
                          Review your AI credit usage.
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
{view === "openProject" && (
  <OpenProjectBrowser
    activeDrawingProjectId={activeDrawingProject?.project.id ?? null}
    onBack={() => setView("home")}
    onOpenDrawingProject={(project) => {
      setActiveDrawingProject(project);
      setView("drawingWorkspace");
    }}
    onOpenStickProject={(project) => {
      setActiveStickProject(project);
      setView("stickFigureWorkspace");
    }}
    onDrawingProjectDeleted={(projectId) => {
      if (activeDrawingProject?.project.id === projectId) {
        setActiveDrawingProject(null);
      }
    }}
  />
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
      style={backButtonStyle(newProjectBackHover)}
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
          setActiveDrawingProject(null);
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
        type="button"
        onClick={(e) => {
          (e.currentTarget as HTMLButtonElement).blur();
          setActiveStickProject(null);
          setView("stickFigureWorkspace");
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
{view === "drawingWorkspace" && (
  <DrawingWorkspace key={activeDrawingProject?.project.id ?? "unsaved-drawing-workspace"} initialProject={activeDrawingProject} />
)}
{view === "stickFigureWorkspace" && (
  <StickFigureWorkspace
    key={activeStickProject?.projectId ?? "unsaved-stick-workspace"}
    initialProject={activeStickProject}
    onOpenStickFigureCreator={() => setView("stickFigureCreatorWorkspace")}
  />
)}
{view === "stickFigureCreatorWorkspace" && <StickFigureCreatorWorkspace onExit={() => setView("stickFigureWorkspace")} />}
    </div>
  );
}
