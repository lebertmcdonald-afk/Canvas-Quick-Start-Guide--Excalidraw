import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { HintId } from "./types";

/**
 * Day 16 (shape-tool, opt-in prompt) + Day 18 (labeling, connecting, save,
 * the "How to start" link): real content and interactivity, replacing Day
 * 15's inert placeholder. Still visually rough on purpose (Day 19 is
 * polish day) -- this is about the interaction being real, not about how
 * it looks.
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

const DEFAULT_CARD_TOP = 76;

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  // Default spot: below the toolbar, not on top of it -- top: 8 used to
  // sit right over the toolbar icons, which is especially bad for the
  // shape-tool hint: it was covering the exact tool it was telling you to
  // click. The card shifts further down, below whichever of Excalidraw's
  // own hint elements is on screen, so it never blocks or gets blocked by
  // them (see useHintCardTop).
  top: DEFAULT_CARD_TOP,
  left: "50%",
  transform: "translateX(-50%)",
  // On a narrow viewport (a phone, or just a narrow browser window) the
  // single flex row pushed the card -- and its buttons -- past the edges
  // of the screen. flexWrap lets a button drop to its own line instead of
  // being crushed alongside the text; maxWidth with border-box (so the
  // padding counts against it) keeps a real margin from the viewport
  // edges; centered content keeps the wrapped layout balanced.
  maxWidth: "calc(100vw - 24px)",
  zIndex: 10,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "6px 10px",
  boxSizing: "border-box",
  background: "#ffffff",
  // Explicit, not inherited: this portal renders straight to document.body,
  // outside .excalidraw's scope, so in the app's own dark theme it was
  // inheriting body's light text color onto this always-white card --
  // rendering every hint invisible, not just mismatched (found by actually
  // switching the app to dark mode and screenshotting, not by inspecting
  // the CSS alone).
  color: "#1b1b1f",
  borderRadius: "0.5rem",
  boxShadow: ISLAND_SHADOW,
  fontFamily: UI_FONT,
  fontSize: 13,
};

/** The copy gives way before the buttons do when the card runs out of room. */
const copyStyle: React.CSSProperties = { flex: "1 1 auto", minWidth: 0 };

/**
 * Excalidraw's own hint text in that same band below the toolbar -- two
 * different elements, never both on screen at once:
 *  - the welcome screen's toolbar tooltip ("Pick a tool & Start
 *    drawing!"), which only renders on an empty canvas and disappears
 *    once the user draws;
 *  - HintViewer, Excalidraw's regular contextual hint ("Hold Cmd and
 *    double-click to edit points", keyboard shortcuts, etc.), which
 *    appears throughout normal use once there's something selected or
 *    mid-draw -- found by screenshotting every hint card and noticing a
 *    sliver of it peeking out from behind ours in three of four.
 */
const NATIVE_HINT_SELECTORS = [
  ".excalidraw .welcome-screen-decor-hint--toolbar",
  ".excalidraw .HintViewer",
];

/**
 * Where the card's top should sit: DEFAULT_CARD_TOP normally, or 8px below
 * whichever native Excalidraw hint is currently on screen, so the two
 * never overlap. Re-measured on DOM changes and resize, since both native
 * hints mount/unmount as the user interacts; a zero-height rect means one
 * is hidden by a media query, which reads the same as absent.
 */
const useHintCardTop = (enabled: boolean) => {
  const [top, setTop] = useState(DEFAULT_CARD_TOP);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const measure = () => {
      const maxBottom = NATIVE_HINT_SELECTORS.reduce((max, selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect && rect.height > 0 ? Math.max(max, rect.bottom) : max;
      }, 0);
      setTop(maxBottom > 0 ? Math.ceil(maxBottom) + 8 : DEFAULT_CARD_TOP);
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

  return top;
};

/**
 * Is Excalidraw's main menu open? The menu panel (.main-menu, radix
 * DropdownMenu content) only exists in the DOM while open, so presence is
 * the whole check. Watched with a MutationObserver because the save hint's
 * highlight follows the user's progress: menu button first, and the save
 * item inside the menu once it's open.
 */
const useMenuOpen = (enabled: boolean) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const check = () => {
      setIsOpen(Boolean(document.querySelector(".excalidraw .main-menu")));
    };

    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, [enabled]);

  return isOpen;
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
  /* the label must never wrap onto a second line inside the button itself
     -- flexWrap on the card wraps the *button as a whole* onto its own
     line on a narrow viewport instead, which is what actually needs to
     give. flex: none stops the row from crushing it in the meantime. */
  white-space: nowrap;
  flex: none;
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
  display: inline-flex;
  align-items: center;
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
  display: inline-flex;
  align-items: center;
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

/** Save hint, stage one: the menu button (top-left hamburger). */
const MENU_BUTTON_HIGHLIGHT_STYLES = `
${HINT_PULSE}
.excalidraw button[data-testid="main-menu-trigger"] {
  animation: quickstart-hint-pulse 1.6s ease-in-out infinite;
}
`;

/** Save hint, stage two: the Save item inside the now-open menu. */
const SAVE_BUTTON_HIGHLIGHT_STYLES = `
${HINT_PULSE}
.excalidraw [data-testid="save-button"] {
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
  const hintCardTop = useHintCardTop(isVisible);
  const menuOpen = useMenuOpen(isVisible && activeHint === "save");
  const positionedOverlayStyle: React.CSSProperties = {
    ...overlayStyle,
    top: hintCardTop,
  };

  if (!isVisible) {
    return null;
  }

  if (!optedIn) {
    return createPortal(
      <>
        <style data-testid="quickstart-button-styles">{BUTTON_STYLES}</style>
        <div data-testid="quickstart-prompt" style={positionedOverlayStyle}>
          <span style={copyStyle}>
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
          <span style={copyStyle}>{copy}</span>
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

  if (activeHint === "save") {
    // The last hint walks the actual save path: highlight the menu button
    // first, then -- once the user opens the menu -- the Save item inside
    // it. Copy follows the same two stages.
    return hintCard(
      "quickstart-hint-save",
      menuOpen
        ? "Now click Save to keep a copy of your drawing."
        : "Your drawing auto-saves in this browser. Use the menu to save a copy.",
      menuOpen ? SAVE_BUTTON_HIGHLIGHT_STYLES : MENU_BUTTON_HIGHLIGHT_STYLES,
    );
  }

  return null;
};
