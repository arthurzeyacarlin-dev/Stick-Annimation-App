import type { ReactNode, Ref } from "react";

type WorkspaceAiPanelShellProps = {
  body: ReactNode;
  composer: ReactNode;
  bodyClassName?: string;
  bodyRef?: Ref<HTMLDivElement>;
};

type WorkspaceAiComposerShellProps = {
  input: ReactNode;
  controls: ReactNode;
};

export function WorkspaceAiPanelShell({
  body,
  composer,
  bodyClassName = "workspace-ai-messages-scroll",
  bodyRef,
}: WorkspaceAiPanelShellProps) {
  return (
    <div
      style={{
        flex: "0 0 55%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <style>{`
        .workspace-ai-messages-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.18) transparent;
        }

        .workspace-ai-messages-scroll::-webkit-scrollbar {
          width: 10px;
        }

        .workspace-ai-messages-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .workspace-ai-messages-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.18);
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }

        .workspace-ai-messages-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.24);
          border: 2px solid transparent;
          background-clip: padding-box;
        }
      `}</style>

      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            aria-hidden="true"
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: "transparent",
              border: "1px solid rgba(110, 170, 255, 0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              position: "relative",
              boxSizing: "border-box",
              transform: "translateY(1px)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-7px",
                left: "50%",
                transform: "translateX(-50%)",
                width: 2,
                height: 7,
                borderRadius: 2,
                background: "rgba(110, 170, 255, 0.90)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "-9px",
                left: "50%",
                transform: "translateX(-50%)",
                width: 4,
                height: 4,
                borderRadius: 999,
                background: "rgba(110, 170, 255, 0.95)",
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                transform: "translateY(-1px)",
              }}
            >
              <div
                style={{
                  width: 2,
                  height: 2,
                  borderRadius: 999,
                  background: "rgba(110, 170, 255, 0.90)",
                }}
              />
              <div
                style={{
                  width: 2,
                  height: 2,
                  borderRadius: 999,
                  background: "rgba(110, 170, 255, 0.90)",
                }}
              />
            </div>
          </div>

          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(180,220,255,0.78)",
              fontWeight: 900,
              userSelect: "none",
              lineHeight: 1.1,
            }}
          >
            AI
            <br />
            ANIMATOR
          </div>
        </div>

        <div
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.50)",
            userSelect: "none",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            flexShrink: 0,
            marginRight: "22px",
          }}
        >
          Generate frames • Clean drawings • Animate faster
        </div>
      </div>

      <div
        ref={bodyRef}
        className={bodyClassName}
        style={{
          flex: 1,
          minHeight: 0,
          padding: 12,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {body}
      </div>

      <div
        style={{
          padding: 10,
          background: "rgba(18,22,28,0.92)",
          flexShrink: 0,
        }}
      >
        {composer}
      </div>
    </div>
  );
}

export function WorkspaceAiComposerShell({ input, controls }: WorkspaceAiComposerShellProps) {
  return (
    <div
      style={{
        padding: "10px 10px 10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(110, 170, 255, 0.28)",
        background: "rgba(18,22,28,0.92)",
        color: "rgba(255,255,255,0.62)",
        fontSize: 12,
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 92,
        position: "relative",
      }}
    >
      {input}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        {controls}
      </div>
    </div>
  );
}
