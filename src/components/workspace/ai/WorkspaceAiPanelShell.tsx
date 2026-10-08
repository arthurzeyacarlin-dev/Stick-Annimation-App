import type { ReactNode, Ref } from "react";
import { workspaceColors } from "../workspaceTheme";

type WorkspaceAiPanelShellProps = {
  body: ReactNode;
  composer: ReactNode;
  bodyClassName?: string;
  bodyRef?: Ref<HTMLDivElement>;
  shellRef?: Ref<HTMLDivElement>;
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
  shellRef,
}: WorkspaceAiPanelShellProps) {
  return (
    <div
      ref={shellRef}
      className="workspace-ai-panel-shell"
      data-terra-panel-surface
      style={{
        flex: "0 0 55%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: workspaceColors.stage,
        borderTop: `1px solid ${workspaceColors.divider}`,
        color: workspaceColors.textSecondary,
      }}
    >
      <style>{`
        .workspace-ai-messages-scroll {
          scrollbar-width: thin;
          scrollbar-color: ${workspaceColors.border} transparent;
        }

        .workspace-ai-messages-scroll::-webkit-scrollbar {
          width: 10px;
        }

        .workspace-ai-messages-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .workspace-ai-messages-scroll::-webkit-scrollbar-thumb {
          background: ${workspaceColors.border};
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }

        .workspace-ai-composer textarea::placeholder {
          color: ${workspaceColors.textMuted};
          opacity: 1;
        }

        .workspace-ai-composer:focus-within {
          border-color: #31588a;
        }

        @media (max-width: 600px) {
          .workspace-ai-panel-shell {
            position: fixed;
            left: 8px;
            right: 8px;
            bottom: 66px;
            height: min(46vh, 370px);
            min-height: 280px;
            z-index: 35;
            border: 1px solid ${workspaceColors.border};
            border-radius: 14px;
            overflow: hidden;
            background: ${workspaceColors.panel};
            box-shadow: 0 20px 50px rgba(0,0,0,0.52);
          }

          .workspace-ai-tagline {
            display: none;
          }
        }
      `}</style>

      <div
        style={{
          padding: "10px 12px",
          borderBottom: `1px solid ${workspaceColors.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke={workspaceColors.iconMuted}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, display: "block" }}
          >
            <path d="M8 1.6v2.2" />
            <circle cx="8" cy="1.6" r="0.6" fill={workspaceColors.iconMuted} />
            <rect x="2.4" y="3.8" width="11.2" height="9" rx="2.4" />
            <circle cx="5.9" cy="8" r="0.9" fill={workspaceColors.iconMuted} stroke="none" />
            <circle cx="10.1" cy="8" r="0.9" fill={workspaceColors.iconMuted} stroke="none" />
            <path d="M6.2 10.7h3.6" />
          </svg>

          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: workspaceColors.textPrimary,
              userSelect: "none",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            AI Animator
          </div>
        </div>

        <div
          className="workspace-ai-tagline"
          style={{
            fontSize: 12,
            color: workspaceColors.textMuted,
            userSelect: "none",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
            marginRight: "22px",
          }}
        >
          Chat with the AI Animator about your animation
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
          padding: "8px 10px 10px",
          background: workspaceColors.stage,
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
      className="workspace-ai-composer"
      style={{
        padding: "10px 10px 10px 12px",
        borderRadius: 14,
        border: `1px solid ${workspaceColors.chatBoxBorder}`,
        background: workspaceColors.chatBox,
        color: workspaceColors.textSecondary,
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
