import React from "react";
import { createPortal } from "react-dom";

import type { HintId } from "./types";

/**
 * Day 16: real content and interactivity, replacing Day 15's inert
 * placeholder. Still visually rough on purpose (Day 19 is polish day) --
 * this is about the interaction being real, not about how it looks.
 *
 * Rendered via a portal to document.body for the same reason as Day 15's
 * placeholder: <Excalidraw>'s children render deep inside a tunneled,
 * overflow: hidden ancestor, which breaks position: fixed.
 */

// Matches the app's own --ui-font / --border-radius-lg / --shadow-island
// tokens (packages/excalidraw/css/theme.scss). Literal values rather than
// var(...) references: those custom properties are scoped to .excalidraw,
// and this renders via a portal to document.body, outside that element,
// so the variables wouldn't resolve there.
const UI_FONT =
  'Assistant, system-ui, BlinkMacSystemFont, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const ISLAND_SHADOW =
  "0px 0px 1px 0px rgba(0, 0, 0, 0.17), 0px 0px 3px 0px rgba(0, 0, 0, 0.08), 0px 7px 14px 0px rgba(0, 0, 0, 0.05)";

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  // Below the toolbar, not on top of it -- top: 8 used to sit right over
  // the toolbar icons, which is especially bad for the shape-tool hint:
  // it was covering the exact tool it was telling you to click.
  top: 76,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 10,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  background: "#ffffff",
  borderRadius: "0.5rem",
  boxShadow: ISLAND_SHADOW,
  fontFamily: UI_FONT,
  fontSize: 13,
};

// <button> elements don't inherit font-family from an ancestor by default
// (browser UA stylesheets set their own), so it has to be applied directly.
const buttonStyle: React.CSSProperties = {
  fontFamily: UI_FONT,
  borderRadius: "0.375rem",
  padding: "6px 10px",
  cursor: "pointer",
};

// Matches the top-right "Share" button's own styling (.collab-button in
// LiveCollaborationTrigger.scss): --color-primary background, white text,
// --border-radius-lg. Used for the one primary action in the guide.
const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  borderRadius: "0.5rem",
  background: "#6965db",
  color: "#ffffff",
  border: "1px solid #6965db",
  padding: "8px 14px",
};

export const QuickstartGuide: React.FC<{
  isVisible: boolean;
  optedIn: boolean;
  activeHint: HintId | null;
  onOptIn: () => void;
  onEndGuide: () => void;
}> = ({ isVisible, optedIn, activeHint, onOptIn, onEndGuide }) => {
  if (!isVisible) {
    return null;
  }

  if (!optedIn) {
    return createPortal(
      <div data-testid="quickstart-prompt" style={overlayStyle}>
        <span>
          Making your first diagram? Turn a process into a simple drawing.
        </span>
        <button style={primaryButtonStyle} onClick={onOptIn}>
          Help me get started
        </button>
        <button style={primaryButtonStyle} onClick={onEndGuide}>
          Keep drawing
        </button>
      </div>,
      document.body,
    );
  }

  if (activeHint === "shape-tool") {
    return createPortal(
      <div data-testid="quickstart-hint-shape-tool" style={overlayStyle}>
        <span>Pick a shape tool above, and draw your first shape.</span>
        <button style={buttonStyle} onClick={onEndGuide}>
          End guide
        </button>
      </div>,
      document.body,
    );
  }

  return null;
};
