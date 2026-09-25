"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NotificationTrigger } from "@/src/components/notifications/NotificationTrigger";

type AppChromeProps = {
  theme?: "default" | "home";
};

export function AppChrome({ theme = "default" }: AppChromeProps) {
  const [menuHover, setMenuHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [menuView, setMenuView] = useState<"root" | "about" | "terms" | "settings">("root");
  const [homeHover, setHomeHover] = useState(false);
  const [creditsHover, setCreditsHover] = useState(false);
  const isHomeTheme = theme === "home";
  const isHomeActive = isHomeTheme;
  const isCreditsActive = !isHomeTheme;
  const headerBackground = "linear-gradient(180deg, rgba(12,19,31,0.98) 0%, rgba(14,21,34,0.96) 100%)";
  const headerBorderColor = "rgba(106, 125, 157, 0.26)";
  const headerShadow = "0 10px 24px rgba(1,7,18,0.18)";
  const menuBorder = menuHover
    ? "1px solid rgba(64, 142, 255, 0.74)"
    : "1px solid rgba(110, 129, 160, 0.36)";
  const menuBackground = menuHover
    ? "linear-gradient(180deg, rgba(13,39,74,0.98) 0%, rgba(8,28,57,0.96) 100%)"
    : "linear-gradient(180deg, rgba(15,23,37,0.96) 0%, rgba(13,20,33,0.94) 100%)";
  const menuShadow = menuHover
    ? "0 12px 24px rgba(1,7,18,0.30), 0 0 0 1px rgba(64,142,255,0.16), 0 0 14px rgba(18,96,194,0.12)"
    : "0 8px 18px rgba(1,7,18,0.18)";
  const menuLineColor = menuHover ? "rgba(232,242,255,0.98)" : "rgba(214,223,236,0.88)";
  const menuOverlayBackground = "rgba(2,6,16,0.62)";
  const menuPanelBackground =
    "radial-gradient(circle at 22% 0%, rgba(22,39,62,0.64) 0%, rgba(22,39,62,0) 38%), linear-gradient(180deg, rgba(9,16,28,0.99) 0%, rgba(8,14,25,0.99) 100%)";
  const menuPanelBorder = "1px solid rgba(119, 142, 176, 0.32)";
  const menuPanelShadow = "-28px 0 52px rgba(1,7,18,0.44), inset 1px 0 0 rgba(157,179,210,0.06)";
  const sectionLabelColor = "rgba(177, 193, 215, 0.74)";
  const accentLabelColor = "rgba(190, 207, 230, 0.84)";
  const dividerColor =
    "linear-gradient(90deg, rgba(92, 114, 146, 0) 0%, rgba(116, 139, 173, 0.28) 46%, rgba(92, 114, 146, 0.06) 100%)";
  const panelItemBorder = "1px solid rgba(117, 139, 173, 0.34)";
  const panelItemBackground =
    "linear-gradient(180deg, rgba(18,29,47,0.98) 0%, rgba(13,23,39,0.98) 100%)";
  const panelItemMutedBackground =
    "linear-gradient(180deg, rgba(11,19,32,0.94) 0%, rgba(9,16,28,0.96) 100%)";
  const panelItemSupportBackground =
    "linear-gradient(180deg, rgba(15,25,41,0.96) 0%, rgba(11,19,33,0.96) 100%)";
  const panelItemAccountBackground = "rgba(8, 14, 24, 0.74)";
  const panelTextColor = "rgba(232, 238, 247, 0.90)";
  const panelTextMutedColor = "rgba(174, 188, 207, 0.76)";
  const modalOverlayBackground = "rgba(2,6,16,0.64)";
  const modalSurfaceBorder = "1px solid rgba(108, 127, 158, 0.24)";
  const modalSurfaceBackground = "linear-gradient(180deg, rgba(14,21,34,0.98) 0%, rgba(15,23,37,0.98) 100%)";
  const modalSurfaceShadow = "0 22px 70px rgba(0,0,0,0.42)";
  const modalCardBackground = "rgba(16, 24, 38, 0.96)";
  const modalCardBorder = "1px solid rgba(108, 127, 158, 0.26)";
  const modalTextColor = "rgba(222, 229, 239, 0.86)";
  const modalSubtleTextColor = "rgba(171, 184, 203, 0.78)";
  const toolbarControlBorder = "1px solid transparent";
  const toolbarControlBackground = "transparent";
  const toolbarControlShadow = "none";
  const toolbarControlTextColor = "rgba(202,218,239,0.78)";
  const toolbarControlEmphasisTextColor = "rgba(230,242,255,0.96)";
  const toolbarControlEmphasisTextShadow = "0 0 14px rgba(77, 163, 255, 0.18)";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setAboutOpen(false);
        setTermsOpen(false);
        setMenuView("root");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const closeMenuLayers = () => {
    setMenuOpen(false);
    setAboutOpen(false);
    setTermsOpen(false);
    setMenuView("root");
  };

  return (
    <>
      <header
        className="topBar"
        style={{
          padding: "2px 24px 16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "20px",
          position: "relative",
          background: headerBackground,
          borderBottom: `1px solid ${headerBorderColor}`,
          boxShadow: headerShadow,
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div className="topLeft" style={{ minWidth: 0, flex: 1 }}>
          <div className="brandStack">
            <h1 className="title" style={{ margin: "-2px 0 2px 0", lineHeight: 0.95 }}>
              Diamond Animator
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

        <div
          className="topRight"
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "78px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "10px",
              flexShrink: 0,
            }}
          >
              {isHomeTheme && (
                <div style={{ position: "relative", top: "7px" }}>
                  <NotificationTrigger view="home" />
                </div>
              )}

              <a
                href="/credits"
                aria-label="Open AI dashboard"
                aria-current={isCreditsActive ? "page" : undefined}
                onMouseEnter={() => setCreditsHover(true)}
                onMouseLeave={() => setCreditsHover(false)}
                style={{
                  padding: "5px 6px",
                  margin: "0 14px",
                  borderRadius: "12px",
                  border: toolbarControlBorder,
                  background: toolbarControlBackground,
                  boxShadow: toolbarControlShadow,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "9px",
                  color:
                    creditsHover || isCreditsActive ? toolbarControlEmphasisTextColor : toolbarControlTextColor,
                  fontSize: "15.5px",
                  fontWeight: 750,
                  lineHeight: 1,
                  letterSpacing: "0.01em",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  transform: "translateY(7px)",
                  textShadow: creditsHover || isCreditsActive ? toolbarControlEmphasisTextShadow : "none",
                  transition: "color 160ms ease, text-shadow 180ms ease",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "5px",
                    border: "none",
                    boxShadow: "none",
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "2px",
                    padding: "1px",
                    boxSizing: "border-box",
                  }}
                >
                  <span style={{ borderRadius: "2px", background: "rgba(102,196,255,0.74)" }} />
                  <span style={{ borderRadius: "2px", background: "rgba(102,196,255,0.42)" }} />
                  <span style={{ borderRadius: "2px", background: "rgba(102,196,255,0.34)" }} />
                  <span style={{ borderRadius: "2px", background: "rgba(102,196,255,0.58)" }} />
                </span>
                AI Dashboard
              </a>

            <Link
              href="/"
              aria-label="Return to main screen"
              aria-current={isHomeActive ? "page" : undefined}
              onMouseEnter={() => setHomeHover(true)}
              onMouseLeave={() => setHomeHover(false)}
              style={{
                padding: "5px 6px",
                margin: "0 14px",
                borderRadius: "12px",
                border: toolbarControlBorder,
                background: toolbarControlBackground,
                boxShadow: toolbarControlShadow,
                display: "inline-flex",
                alignItems: "center",
                gap: "9px",
                color: homeHover || isHomeActive ? toolbarControlEmphasisTextColor : toolbarControlTextColor,
                fontSize: "15.5px",
                fontWeight: 750,
                lineHeight: 1,
                letterSpacing: "0.01em",
                textDecoration: "none",
                whiteSpace: "nowrap",
                transform: "translateY(7px)",
                textShadow: homeHover || isHomeActive ? toolbarControlEmphasisTextShadow : "none",
                transition: "color 160ms ease, text-shadow 180ms ease",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                style={{ width: "20px", height: "20px" }}
              >
                <path
                  d="M4.5 11.2 12 5l7.5 6.2"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M7.2 10.4v7.1h9.6v-7.1"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Home
            </Link>
          </div>

          <button
            className="menuBtn"
            aria-label="Menu"
            onClick={() => setMenuOpen((value) => !value)}
            onMouseEnter={() => setMenuHover(true)}
            onMouseLeave={() => setMenuHover(false)}
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "10px",
              border: menuBorder,
              background: menuBackground,
              boxShadow: menuShadow,
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
            <span
              style={{
                width: "18px",
                height: "2px",
                background: menuLineColor,
                borderRadius: "2px",
              }}
            />
            <span
              style={{
                width: "18px",
                height: "2px",
                background: menuLineColor,
                borderRadius: "2px",
              }}
            />
            <span
              style={{
                width: "18px",
                height: "2px",
                background: menuLineColor,
                borderRadius: "2px",
              }}
            />
          </button>
        </div>
      </header>

      <div
        aria-hidden={!menuOpen}
        onClick={closeMenuLayers}
        style={{
          position: "fixed",
          inset: 0,
          background: menuOverlayBackground,
          opacity: menuOpen ? 1 : 0,
          transition: "opacity 180ms ease",
          pointerEvents: menuOpen ? "auto" : "none",
          zIndex: 45,
        }}
      />

      <aside
        aria-label="Menu panel"
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "300px",
          background: menuPanelBackground,
          borderLeft: menuPanelBorder,
          boxShadow: menuPanelShadow,
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
              color: sectionLabelColor,
            }}
          >
            Menu
          </div>

          <button
            aria-label="Close menu"
            onClick={closeMenuLayers}
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

        <div style={{ height: "1px", background: dividerColor }} />

        {menuView !== "settings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div
            style={{
              fontSize: "12px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: accentLabelColor,
            }}
          >
            About Diamond Animator
          </div>

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
                  border: panelItemBorder,
                  background: panelItemBackground,
                  color: panelTextColor,
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
                  border: panelItemBorder,
                  background: panelItemBackground,
                  color: panelTextColor,
                  fontSize: "13px",
                  cursor: "pointer",
                  appearance: "none",
                }}
              >
                Terms of Policy
              </button>
            </>
          )}

          {menuView === "about" && (
            <div
              style={{
                padding: "12px 12px",
                borderRadius: "12px",
                border: panelItemBorder,
                background: panelItemMutedBackground,
                color: panelTextColor,
                fontSize: "13px",
                lineHeight: 1.45,
              }}
            >
              <div style={{ fontWeight: 800, letterSpacing: "0.02em", marginBottom: 8 }}>Diamond Animator Pro</div>
              <div>
                Diamond Animator Pro is a high-focus animation workspace designed to dramatically reduce the time and effort
                required to create high-quality animations.
              </div>
              <div style={{ height: 10 }} />
              <div>
                Built for creators who want speed, power, and precision, Diamond Animator Pro integrates advanced AI assistance
                directly into the animation pipeline, helping transform what once took years of manual effort into streamlined
                production cycles measured in months, weeks, or even days.
              </div>
              <div style={{ height: 10 }} />
              <div style={{ fontWeight: 750, marginBottom: 6 }}>AI assistance can help you:</div>
              <ul style={{ margin: "0 0 0 18px", padding: 0 }}>
                <li>Assist in generating animation frames</li>
                <li>Help create visual effects</li>
                <li>Support scene refinement and enhancement</li>
                <li>Automate repetitive tasks</li>
                <li>Accelerate creative workflows</li>
              </ul>
              <div style={{ height: 10 }} />
              <div>
                Diamond Animator Pro is not about replacing creators. It is about amplifying them. The AI works alongside you,
                assisting with heavy workloads and overnight processing to keep your creative momentum moving forward.
              </div>
              <div style={{ height: 14 }} />
              <div style={{ fontWeight: 750, marginBottom: 6 }}>Workspace add-ons</div>
              <div style={{ color: modalSubtleTextColor }}>
                Diamond Animator supports add-ons like plugins and packs, which let you extend your workspace with new tools and
                content.
              </div>
              <div style={{ height: 14 }} />
              <button
                type="button"
                onClick={() => setMenuView("root")}
                style={{
                  width: "100%",
                  padding: "10px 10px",
                  borderRadius: "10px",
                  border: panelItemBorder,
                  background: panelItemBackground,
                  color: panelTextColor,
                  fontSize: "13px",
                  cursor: "pointer",
                  appearance: "none",
                }}
              >
                Back
              </button>
            </div>
          )}

          {menuView === "terms" && (
            <div
              style={{
                padding: "12px 12px",
                borderRadius: "12px",
                border: panelItemBorder,
                background: panelItemMutedBackground,
                color: panelTextColor,
                fontSize: "13px",
                lineHeight: 1.45,
              }}
            >
              <div style={{ fontWeight: 800, letterSpacing: "0.02em", marginBottom: 8 }}>Terms of Policy</div>
              <div style={{ color: "rgba(255,255,255,0.86)" }}>
                <div style={{ fontWeight: 750, marginBottom: 6 }}>Keep it creative.</div>
                <div style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.55 }}>
                  Diamond Animator is built to support ambitious creativity within clear safety standards. Use the workspace
                  responsibly and keep your content safe for a broad audience.
                </div>
              </div>
              <div style={{ height: 12 }} />
              <div style={{ fontWeight: 750, marginBottom: 6, color: "rgba(255,255,255,0.90)" }}>What Diamond Animator is for</div>
              <div style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.55 }}>
                Diamond Animator is a creative workspace for making animations and visual stories, from stick-figure motion to
                hand-drawn scenes, with optional AI assistance to speed up your workflow.
              </div>
              <div style={{ height: 12 }} />
              <div style={{ fontWeight: 750, marginBottom: 6, color: "rgba(255,255,255,0.90)" }}>What you can create</div>
              <div style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.55 }}>
                You can create all kinds of original, positive content, including action, cartoon fighting, comedy, storytelling,
                education, and experiments with motion and effects.
                <br />
                <span style={{ color: "rgba(255,255,255,0.70)" }}>(This list is not a limit. It is just examples.)</span>
              </div>
              <div style={{ height: 12 }} />
              <div style={{ fontWeight: 750, marginBottom: 6, color: "rgba(255,255,255,0.90)" }}>What is not allowed</div>
              <ul style={{ margin: "0 0 0 18px", padding: 0, color: "rgba(255,255,255,0.78)", lineHeight: 1.55 }}>
                <li>
                  <b style={{ color: "rgba(255,255,255,0.88)" }}>Sexual content</b> - nudity or sexual acts are not allowed.
                </li>
                <li>
                  <b style={{ color: "rgba(255,255,255,0.88)" }}>Graphic violence / gore</b> - extreme injury, blood, or disturbing
                  violence is not allowed.
                </li>
                <li>
                  <b style={{ color: "rgba(255,255,255,0.88)" }}>Teaching illegal or harmful actions</b> - content that instructs
                  people how to do illegal, dangerous, or harmful things is not allowed.
                </li>
                <li>
                  <b style={{ color: "rgba(255,255,255,0.88)" }}>Self-harm encouragement</b> - content that encourages, promotes, or
                  instructs self-harm is not allowed.
                </li>
              </ul>
              <div style={{ height: 12 }} />
              <div style={{ fontWeight: 750, marginBottom: 6, color: "rgba(255,255,255,0.90)" }}>How enforcement works</div>
              <div style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.55 }}>
                If something appears to break these rules, you may see a warning or your content may be restricted or removed. For
                serious violations, especially sexual content or extreme violence, removal may be immediate.
              </div>
              <div style={{ height: 12 }} />
              <div style={{ fontWeight: 750, marginBottom: 6, color: "rgba(255,255,255,0.90)" }}>In short</div>
              <div style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.55 }}>
                Create freely, just keep it safe, non-sexual, and non-graphic.
              </div>
              <div style={{ height: 14 }} />
              <button
                type="button"
                onClick={() => setMenuView("root")}
                style={{
                  width: "100%",
                  padding: "10px 10px",
                  borderRadius: "10px",
                  border: panelItemBorder,
                  background: panelItemBackground,
                  color: panelTextColor,
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
        )}

        {menuView === "settings" && (
          <div
            style={{
              padding: "12px 12px",
              borderRadius: "12px",
              border: panelItemBorder,
              background: panelItemMutedBackground,
              color: panelTextColor,
              fontSize: "13px",
              lineHeight: 1.45,
            }}
          >
            <div style={{ fontWeight: 800, letterSpacing: "0.02em", marginBottom: 8 }}>Settings</div>
            <div style={{ color: panelTextMutedColor }}>
              Settings will live here when the app settings surface is wired. This entry is a safe visual placeholder for now.
            </div>
            <div style={{ height: 14 }} />
            <button
              type="button"
              onClick={() => setMenuView("root")}
              style={{
                width: "100%",
                padding: "10px 10px",
                borderRadius: "10px",
                border: panelItemBorder,
                background: panelItemBackground,
                color: panelTextColor,
                fontSize: "13px",
                cursor: "pointer",
                appearance: "none",
              }}
            >
              Back
            </button>
          </div>
        )}

        {menuView === "root" && (
          <>
            <div style={{ height: "1px", background: dividerColor, margin: "6px 0" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div
                style={{
                  fontSize: "12px",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: sectionLabelColor,
                }}
              >
                Workspace
              </div>

              <button
                type="button"
                onClick={() => setMenuView("settings")}
                style={{
                  textAlign: "left",
                  padding: "10px 10px",
                  borderRadius: "10px",
                  border: panelItemBorder,
                  background: panelItemBackground,
                  color: panelTextColor,
                  fontSize: "13px",
                  cursor: "pointer",
                  appearance: "none",
                }}
              >
                Settings
              </button>
            </div>
          </>
        )}

        <div style={{ height: "1px", background: dividerColor, margin: "6px 0" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div
            style={{
              fontSize: "12px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: sectionLabelColor,
            }}
          >
            Support
          </div>
          <div
            style={{
              padding: "10px 10px",
              borderRadius: "10px",
              border: panelItemBorder,
              background: panelItemSupportBackground,
              color: panelTextColor,
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
              color: sectionLabelColor,
            }}
          >
            Account
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {["Sign in", "Log in", "Sign out"].map((label) => (
              <div
                key={label}
                style={{
                  padding: "10px 10px",
                  borderRadius: "10px",
                  border: panelItemBorder,
                  background: panelItemAccountBackground,
                  color: panelTextMutedColor,
                  fontSize: "13px",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {aboutOpen && (
        <div
          onClick={() => setAboutOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: modalOverlayBackground,
            zIndex: 80,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "18px",
          }}
        >
          <div
            className="darkScroll"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(1100px, calc(100vw - 40px))",
              maxHeight: "calc(100vh - 40px)",
              overflowY: "scroll",
              overflowX: "hidden",
              borderRadius: "4px",
              overflow: "hidden",
              border: modalSurfaceBorder,
              background: modalSurfaceBackground,
              boxShadow: modalSurfaceShadow,
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
                  color: accentLabelColor,
                }}
              >
                About Diamond Animator
                </div>
                <div style={{ fontSize: "26px", fontWeight: 750, color: "rgba(255,255,255,0.92)" }}>Description</div>
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
              border: modalCardBorder,
              background: modalCardBackground,
              color: modalTextColor,
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
                Diamond Animator Pro is a high-focus animation workspace designed to dramatically reduce the time and effort required
                to create high-quality animations.
              </p>

              <p>
                Built for creators who want speed, power, and precision, Diamond Animator Pro integrates advanced AI assistance
                directly into the animation pipeline, helping transform what once took years into months, months into weeks, and
                weeks into days.
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
                Diamond Animator Pro is not about replacing creators. It is about amplifying them. The AI works alongside you to keep
                your creative momentum moving forward.
              </p>

              <div style={{ height: 14 }} />
              <div style={{ fontWeight: 750, marginBottom: 6 }}>Workspace add-ons</div>
              <div style={{ color: modalSubtleTextColor }}>
                Diamond Animator is a developing platform that continues to improve over time. Through plugins and packs, creators will
                be able to extend their workspace with additional tools and creative enhancements as they become available.
                <br />
                <br />
                Some add-ons will be free, while others may offer more advanced capabilities for focused workflows. These expansions
                are designed to support creativity without disrupting the core experience of the workspace.
              </div>
            </div>
          </div>
        </div>
      )}

      {termsOpen && (
        <div
          onClick={() => setTermsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: modalOverlayBackground,
            zIndex: 80,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "18px",
          }}
        >
          <div
            className="darkScroll"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(1100px, calc(100vw - 40px))",
              maxHeight: "calc(100vh - 40px)",
              overflow: "auto",
              borderRadius: "4px",
              border: modalSurfaceBorder,
              background: modalSurfaceBackground,
              boxShadow: modalSurfaceShadow,
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
                <div style={{ fontSize: "26px", fontWeight: 750, color: "rgba(255,255,255,0.92)" }}>Terms of Policy</div>
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
              border: modalCardBorder,
              background: modalCardBackground,
              color: modalTextColor,
              fontSize: "14px",
              lineHeight: 1.65,
            }}
            >
              <div style={{ fontSize: "22px", fontWeight: 800, marginBottom: "10px" }}>Diamond Animator Pro</div>
              <div style={{ fontWeight: 750, marginBottom: 6 }}>1. Purpose of the Platform</div>
              <p>
                Diamond Animator Pro is a creative animation workspace designed for building original animated content using drawing
                tools, character systems, and AI assistance.
              </p>
              <p>
                The platform is built to support a wide range of creative styles, from action and storytelling to education, comedy,
                experimental animation, and beyond. You are not limited to specific genres or formats. Creativity is open-ended, as
                long as it stays within safe and responsible boundaries.
              </p>
              <div style={{ height: 16 }} />
              <div style={{ fontWeight: 750, marginBottom: 6 }}>2. Creative Freedom</div>
              <p>You are free to create original animated content of many kinds, including but not limited to:</p>
              <ul style={{ marginTop: 0, paddingLeft: "18px" }}>
                <li>Action scenes and stylized cartoon fighting (non-graphic)</li>
                <li>Story-driven animations</li>
                <li>Educational content</li>
                <li>Fictional worlds and characters</li>
                <li>Experimental or artistic projects</li>
                <li>Comedy and entertainment</li>
              </ul>
              <p>These are examples, not limits. Diamond Animator is designed to support imagination, not restrict it.</p>
              <div style={{ height: 16 }} />
              <div style={{ fontWeight: 750, marginBottom: 6 }}>3. Not Allowed Content</div>
              <ul style={{ marginTop: 0, paddingLeft: "18px" }}>
                <li>
                  <b>Sexual content of any kind</b> (including nudity, sexual acts, or explicit material). This may result in
                  immediate removal.
                </li>
                <li>
                  <b>Graphic or extreme violence</b> (gore, torture, dismemberment, or disturbing violent detail).
                </li>
                <li>
                  <b>Teaching illegal or harmful activities</b> (content intended to show others how to perform unlawful or dangerous
                  actions).
                </li>
                <li>
                  <b>Encouraging self-harm or harm toward others</b>.
                </li>
              </ul>
              <p>Diamond Animator is not a platform for content that promotes real-world harm.</p>
              <div style={{ height: 16 }} />
              <div style={{ fontWeight: 750, marginBottom: 6 }}>4. Enforcement</div>
              <ul style={{ marginTop: 0, paddingLeft: "18px" }}>
                <li>A warning may appear stating the content may violate policy.</li>
                <li>Some content may be blocked or restricted.</li>
                <li>Severe violations may result in immediate removal.</li>
              </ul>
              <div style={{ height: 16 }} />
              <div style={{ fontWeight: 750, marginBottom: 6 }}>5. Keep It Creative</div>
              <p>
                Diamond Animator is built to support ambitious creativity within clear safety standards. Users are expected to use the
                platform responsibly and in alignment with these guidelines.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
