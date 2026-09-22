import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { HintId } from "./types";

/**
 * Day 16 (shape-tool, opt-in prompt) + Day 18 (labeling, the "How to
 * start" link): real content and interactivity, replacing Day 15's inert
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
  // Default spot: below the toolbar, not on top of it -- top: 8 used to
  // sit right over the toolbar icons, which is especially bad for the
  // shape-tool hint: it was covering the exact tool it was telling you to
  // click. While the welcome screen's toolbar tooltip ("Pick a tool &
  // Start drawing!") is on screen, the card is shifted further down, below
  // that tooltip, so it never blocks those first-use instructions (see
  // useToolbarHintBottom).
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

/**
 * The welcome screen's toolbar tooltip, which the card must not block while
 * it's visible (it only renders while the welcome screen does -- empty
 * canvas, tall enough viewport -- and disappears once the user draws).
 */
const TOOLBAR_HINT_SELECTOR = ".excalidraw .welcome-screen-decor-hint--toolbar";

/**
 * Bottom edge (viewport px) of the welcome screen's toolbar tooltip, or
 * null when it isn't on screen. Re-measured on DOM changes and resize
 * because the tooltip mounts after the initial load and unmounts when the
 * user starts drawing; a zero-height rect means it's hidden by the
 * welcome screen's media queries, which reads the same as absent.
 */
const useToolbarHintBottom = (enabled: boolean) => {
  const [bottom, setBottom] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const measure = () => {
      const hint = document.querySelector(TOOLBAR_HINT_SELECTOR);
      const rect = hint?.getBoundingClientRect();
      setBottom(rect && rect.height > 0 ? Math.ceil(rect.bottom) : null);
    };

    measure();
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [enabled]);

  return bottom;
};

/**
 * Buttons live in a rendered stylesheet rather than inline styles because
 * they need :hover/:active states, matching the app's own buttons (values
 * are the light-theme literals of the tokens in packages/excalidraw/css/theme.scss
 * and excalidraw-app/index.scss, since the vars themselves are scoped to
 * .excalidraw and don't resolve in this portal):
 *  - primary actions ("Help me get started", "End guide") match the
 *    top-right "Share" button (.collab-button): --color-primary
 *    background/border, hovering to --color-primary-darker (#5b57d1) on
 *    both.
 *  - the secondary action ("Keep drawing") matches the "Excalidraw+"
 *    button (.plus-banner): --color-surface-low background, a
 *    --color-surface-lowest 1px ring instead of a border,
 *    --color-on-surface text, hovering to --color-primary with white
 *    text and pressing to --color-primary-darker.
 *  - the base class carries no border at all, so the UA default border
 *    stays invisible on any future unstyled usage.
 */
const BUTTON_STYLES = `
.quickstart-btn {
  font-family: ${UI_FONT};
  font-size: 13px;
  border: none;
  background: none;
  padding: 6px 10px;
  border-radius: 0.375rem;
  cursor: pointer;
}
.quickstart-btn:hover {
  background: #f1f0ff;
}
.quickstart-btn--primary {
  background: #6965db;
  border: 1px solid #6965db;
  color: #ffffff;
  padding: 8px 14px;
  height: 2.25rem;
  box-sizing: border-box;
  border-radius: 0.5rem;
}
.quickstart-btn--primary:hover {
  background: #5b57d1;
  border-color: #5b57d1;
}
.quickstart-btn--secondary {
  background: #ececf4;
  box-shadow: 0 0 0 1px #ffffff;
  color: #1b1b1f;
  padding: 8px 14px;
  height: 2.25rem;
  box-sizing: border-box;
  border-radius: 0.5rem;
}
.quickstart-btn--secondary:hover {
  background: #6965db;
  color: #ffffff;
}
.quickstart-btn--secondary:active {
  background: #5b57d1;
  box-shadow: 0 0 0 1px #4440bf;
}
`;

/**
 * The shape-tool hint's "highlight the shape tool" (PRD response table): a
 * pulsing box-shadow on the toolbar's shape buttons, selected by their
 * stable data-testids. Rendered as a <style> tag only while that hint is
 * showing, so it leaves no trace once the guide moves on or ends -- and
 * box-shadow can't shift layout or intercept pointer events on the tools.
 */
const HINT_PULSE = `
@keyframes quickstart-hint-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(105, 101, 219, 0); }
  50% { box-shadow: 0 0 0 6px rgba(105, 101, 219, 0.5); }
}
`;

const SHAPE_TOOL_HIGHLIGHT_STYLES = `
${HINT_PULSE}
.excalidraw button[data-testid="toolbar-rectangle"],
.excalidraw button[data-testid="toolbar-diamond"],
.excalidraw button[data-testid="toolbar-ellipse"] {
  animation: quickstart-hint-pulse 1.6s ease-in-out infinite;
}
`;

const ARROW_TOOL_HIGHLIGHT_STYLES = `
${HINT_PULSE}
.excalidraw button[data-testid="toolbar-arrow"] {
  animation: quickstart-hint-pulse 1.6s ease-in-out infinite;
}
`;

export const QuickstartGuide: React.FC<{
  isVisible: boolean;
  optedIn: boolean;
  activeHint: HintId | null;
  onOptIn: () => void;
  onEndGuide: () => void;
}> = ({ isVisible, optedIn, activeHint, onOptIn, onEndGuide }) => {
  const toolbarHintBottom = useToolbarHintBottom(isVisible);
  const positionedOverlayStyle: React.CSSProperties = {
    ...overlayStyle,
    top: toolbarHintBottom !== null ? toolbarHintBottom + 8 : overlayStyle.top,
  };

  if (!isVisible) {
    return null;
  }

  if (!optedIn) {
    return createPortal(
      <>
        <style data-testid="quickstart-button-styles">{BUTTON_STYLES}</style>
        <div data-testid="quickstart-prompt" style={positionedOverlayStyle}>
          <span>
            Making your first diagram? Turn a process into a simple drawing.
          </span>
          <button
            className="quickstart-btn quickstart-btn--primary"
            data-testid="quickstart-opt-in"
            onClick={onOptIn}
          >
            Help me get started
          </button>
          <button
            className="quickstart-btn quickstart-btn--secondary"
            data-testid="quickstart-decline"
            onClick={onEndGuide}
          >
            Keep drawing
          </button>
          {/* "How to start with Excalidraw" moved to the shortcuts-and-help
              dialog (QuickstartHelpButton) so the prompt stays a two-choice
              decision. */}
        </div>
      </>,
      document.body,
    );
  }

  const hintCard = (testid: string, copy: string, highlight?: string) =>
    createPortal(
      <>
        <style data-testid="quickstart-button-styles">{BUTTON_STYLES}</style>
        {highlight && (
          <style data-testid={`${testid}-styles`}>{highlight}</style>
        )}
        <div data-testid={testid} style={positionedOverlayStyle}>
          <span>{copy}</span>
          <button
            className="quickstart-btn quickstart-btn--primary"
            data-testid="quickstart-end-guide"
            onClick={onEndGuide}
          >
            End guide
          </button>
        </div>
      </>,
      document.body,
    );

  if (activeHint === "shape-tool") {
    return hintCard(
      "quickstart-hint-shape-tool",
      "Pick a highlighted shape tool in the toolbar, then draw your first shape.",
      SHAPE_TOOL_HIGHLIGHT_STYLES,
    );
  }

  if (activeHint === "labeling") {
    return hintCard(
      "quickstart-hint-labeling",
      "Double-click a shape to name this step.",
    );
  }

  if (activeHint === "connecting") {
    return hintCard(
      "quickstart-hint-connecting",
      "Draw an arrow to connect two shapes.",
      ARROW_TOOL_HIGHLIGHT_STYLES,
    );
  }

  return null;
};
