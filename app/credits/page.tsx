import { AppChrome } from "@/src/components/chrome/AIcreditspage";

const creditPacks = [
  { amount: 500, label: "Quick Top-Up", note: "A small refill for lighter AI use and quick animation tasks." },
  {
    amount: 2000,
    label: "Creator Top-Up",
    note: "A balanced refill for regular animation sessions and creative workflows.",
  },
  {
    amount: 5000,
    label: "Studio Top-Up",
    note: "A larger refill for heavy AI use, longer projects, and faster production.",
  },
];

const summaryDetails = [
  { label: "Current Plan", value: "Creator" },
  { label: "Monthly Refill", value: "5,000 credits / month" },
  { label: "Next Refill Date", value: "April 1, 2026" },
];

const planOptions = [
  {
    name: "Creator",
    refill: "5,000 credits / month",
    note: "Good for regular AI-assisted animation work.",
    isCurrent: true,
  },
  {
    name: "Studio",
    refill: "10,000 credits / month",
    note: "Built for heavier production and bigger monthly refills.",
    isCurrent: false,
  },
];

const pageBackground =
  "linear-gradient(180deg, #060f18 0%, #08111b 44%, #09131d 100%)";
const pageMainBackground =
  "linear-gradient(180deg, rgba(9,14,23,0.99) 0%, rgba(10,15,25,0.99) 48%, rgba(8,13,22,1) 100%)";
const panelBackground =
  "linear-gradient(180deg, rgba(16,24,38,0.97) 0%, rgba(13,20,34,0.97) 100%)";
const panelBorder = "1px solid rgba(104, 123, 154, 0.34)";
const panelShadow = "0 16px 28px rgba(1,7,18,0.22)";
const panelMutedText = "rgba(174, 186, 204, 0.72)";
const panelLabelText = "rgba(176, 190, 212, 0.74)";
const insetPanelBackground =
  "linear-gradient(180deg, rgba(14,22,36,0.90) 0%, rgba(12,19,31,0.92) 100%)";
const accentPanelBackground =
  "linear-gradient(180deg, rgba(16,34,56,0.82) 0%, rgba(13,26,43,0.86) 100%)";
const accentPanelBorder = "1px solid rgba(76, 126, 198, 0.32)";

const sectionCardStyle = {
  borderRadius: "20px",
  border: panelBorder,
  background: panelBackground,
  boxShadow: panelShadow,
  padding: "24px",
} as const;

export default function CreditsPage() {
  return (
    <div
      style={{
        height: "100vh",
        background: pageBackground,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <AppChrome />

      <main
        style={{
          flex: 1,
          padding: "30px 20px 64px 20px",
          display: "flex",
          justifyContent: "center",
          background: pageMainBackground,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        <div
          style={{
            width: "min(980px, 100%)",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            paddingBottom: "72px",
          }}
        >
          <section
            style={{
              borderRadius: "20px",
              border: panelBorder,
              background: panelBackground,
              boxShadow: panelShadow,
              padding: "28px 28px 26px 28px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: panelLabelText,
                marginBottom: "10px",
              }}
            >
              Credits Overview
            </div>
            <div style={{ fontSize: "34px", fontWeight: 800, color: "rgba(255,255,255,0.95)", marginBottom: "8px" }}>
              AI Credits
            </div>
            <div style={{ color: panelMutedText, fontSize: "14px", lineHeight: 1.5, maxWidth: "620px" }}>
              Use credits to power AI tools in Diamond Animator. Buy more anytime or upgrade your monthly plan for bigger
              refills.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "18px",
                marginTop: "24px",
              }}
            >
                <div
                  style={{
                    padding: "20px 22px",
                    borderRadius: "18px",
                    border: accentPanelBorder,
                    background: accentPanelBackground,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      color: "rgba(184, 204, 229, 0.78)",
                    }}
                  >
                    Credits Remaining
                  </div>
                  <div style={{ fontSize: "42px", fontWeight: 820, lineHeight: 1, color: "rgba(255,255,255,0.98)" }}>
                    1,240
                  </div>
                  <div style={{ color: panelMutedText, fontSize: "14px", lineHeight: 1.55 }}>
                    Use credits for AI-powered tools, creative tasks, and future animation workflows in Diamond Animator.
                  </div>
                </div>

              <div
                style={{
                  borderRadius: "18px",
                  border: "1px solid rgba(104, 123, 154, 0.28)",
                  background: insetPanelBackground,
                  overflow: "hidden",
                }}
              >
                {summaryDetails.map((item, index) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "18px",
                      padding: "18px 20px",
                      borderTop: index === 0 ? "none" : "1px solid rgba(96, 116, 147, 0.18)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        letterSpacing: "0.10em",
                        textTransform: "uppercase",
                        color: "rgba(176, 190, 212, 0.70)",
                      }}
                    >
                      {item.label}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.92)", fontSize: "16px", fontWeight: 700, textAlign: "right" }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section
            style={{
              ...sectionCardStyle,
              marginBottom: "80px",
            }}
          >
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  fontSize: "12px",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: panelLabelText,
                  marginBottom: "10px",
                }}
              >
                Upgrade Monthly Plan
              </div>
              <div style={{ color: panelMutedText, fontSize: "14px", lineHeight: 1.5, maxWidth: "620px" }}>
                Upgrade for a bigger monthly refill. Plan billing is not connected yet in this first pass.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                gap: "16px",
              }}
            >
              {planOptions.map((plan) => (
                <div
                  key={plan.name}
                  style={{
                    borderRadius: "18px",
                    border: plan.isCurrent ? accentPanelBorder : "1px solid rgba(104, 123, 154, 0.28)",
                    background: plan.isCurrent ? accentPanelBackground : insetPanelBackground,
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                    <div
                      style={{
                        fontSize: "12px",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "rgba(176, 190, 212, 0.72)",
                      }}
                    >
                      {plan.name}
                    </div>
                    {plan.isCurrent && (
                      <div
                        style={{
                          borderRadius: "999px",
                          border: "1px solid rgba(76, 126, 198, 0.34)",
                          background: "rgba(37, 76, 122, 0.28)",
                          color: "rgba(235,245,255,0.94)",
                          padding: "6px 10px",
                          fontSize: "11px",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Current Plan
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: "rgba(255,255,255,0.96)" }}>{plan.refill}</div>
                  <div style={{ color: panelMutedText, fontSize: "14px", lineHeight: 1.55 }}>{plan.note}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={sectionCardStyle}>
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  fontSize: "12px",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: panelLabelText,
                  marginBottom: "10px",
                }}
              >
                Buy More Credits
              </div>
              <div style={{ color: panelMutedText, fontSize: "14px" }}>
                Choose a fixed top-up size for extra AI use between your monthly refills.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "14px",
              }}
            >
              {creditPacks.map((pack) => (
                <button
                  key={pack.amount}
                  type="button"
                  style={{
                    textAlign: "left",
                    borderRadius: "18px",
                    border: "1px solid rgba(104, 123, 154, 0.28)",
                    background: insetPanelBackground,
                    padding: "18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(176, 190, 212, 0.72)",
                    }}
                  >
                    {pack.label}
                  </div>
                  <div style={{ fontSize: "34px", fontWeight: 850, color: "rgba(255,255,255,0.96)", lineHeight: 0.95 }}>
                    {pack.amount}
                  </div>
                  <div style={{ color: panelMutedText, fontSize: "14px", lineHeight: 1.5 }}>{pack.note}</div>
                  <div
                    style={{
                      marginTop: "4px",
                      color: "rgba(235,245,255,0.96)",
                      fontSize: "13px",
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                    }}
                  >
                    Buy {pack.amount} Credits
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
