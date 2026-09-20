import React from "react";
import { createPortal } from "react-dom";

import { appJotaiStore, useAtomValue, useSetAtom } from "../app-jotai";

import { nextHint } from "./behavior";
import {
  activeHintAtom,
  completedHintsAtom,
  guideEndedAtom,
  guideOptedInAtom,
} from "./state";

import type { HintId } from "./types";

/**
 * Day 16: the real prompt and first hint.
 *
 * Rendered via a portal to document.body (not inline) because this component
 * is passed as a child of <Excalidraw>, which nests children inside the
 * `.excalidraw` root -- a box with `overflow: hidden` that traps absolutely
 * positioned descendants. See the Day 15 fix commit for the full story.
 *
 * Everything -- prompt, hint, styling -- mounts only for an eligible new user
 * who hasn't ended the guide, so there is nothing to intercept, delay, or
 * render for anyone else (the P0 exit check both days protect).
 */

const HintBody: React.FC<{ hintId: HintId }> = ({ hintId }) => {
  if (hintId !== "shape-tool") {
    // Only the first hint is implemented (Day 16). Later days add theirs.
    return null;
  }
  return (
    <>
      <div className="quickstart-card__title">Draw your first shape</div>
      <div className="quickstart-card__body">
        Pick a shape tool on the left toolbar — it's highlighted — then drag on
        the canvas to draw one.
      </div>
    </>
  );
};

const QuickstartGuide: React.FC<{
  isNewUser: boolean | null;
  onEndGuide: () => void;
}> = ({ isNewUser, onEndGuide }) => {
  const optedIn = useAtomValue(guideOptedInAtom);
  const activeHint = useAtomValue(activeHintAtom);
  const ended = useAtomValue(guideEndedAtom);

  const setOptedIn = useSetAtom(guideOptedInAtom);
  const setActiveHint = useSetAtom(activeHintAtom);
  const setEnded = useSetAtom(guideEndedAtom);

  if (!isNewUser || ended) {
    return null;
  }

  const optIn = () => {
    setOptedIn(true);
    setActiveHint(nextHint(appJotaiStore.get(completedHintsAtom)));
  };

  const endGuide = () => {
    setEnded(true);
    onEndGuide();
  };

  return createPortal(
    <>
      <style data-testid="quickstart-card-styles">{CARD_STYLES}</style>
      {activeHint === "shape-tool" && (
        <style data-testid="quickstart-shape-tool-styles">
          {SHAPE_TOOL_HIGHLIGHT_STYLES}
        </style>
      )}
      {optedIn ? (
        activeHint && (
          <div
            className="quickstart-card"
            data-testid={`quickstart-hint-${activeHint}`}
            role="status"
          >
            <HintBody hintId={activeHint} />
            <button
              className="quickstart-card__end"
              data-testid="quickstart-end-guide"
              onClick={endGuide}
            >
              End guide
            </button>
          </div>
        )
      ) : (
        <div className="quickstart-card" data-testid="quickstart-prompt">
          <div className="quickstart-card__title">
            Making your first diagram?
          </div>
          <div className="quickstart-card__body">
            Turn a process into a simple drawing. We'll give you one hint at a
            time and stay out of the way.
          </div>
          <div className="quickstart-card__actions">
            <button
              className="quickstart-card__primary"
              data-testid="quickstart-opt-in"
              onClick={optIn}
            >
              Help me get started
            </button>
            <button
              className="quickstart-card__end"
              data-testid="quickstart-decline"
              onClick={endGuide}
            >
              Keep drawing
            </button>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
};

/**
 * Injected only while the guide is on screen (the <style> tags unmount with
 * the portal), so the toolbar highlight below leaves no trace once the guide
 * is gone. The highlight is box-shadow only: it can't shift layout or
 * intercept pointer events on the tool buttons.
 */
const CARD_STYLES = `
.quickstart-card {
  position: fixed;
  bottom: 48px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  box-sizing: border-box;
  width: min(360px, calc(100vw - 32px));
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid #e4e4ef;
  background: #ffffff;
  color: #1b1b1f;
  font-family: "Excalifont", "Xiaolai", sans-serif;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
.quickstart-card__title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}
.quickstart-card__body {
  font-size: 13px;
  line-height: 1.45;
  color: #3d3d47;
}
.quickstart-card__actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.quickstart-card__actions .quickstart-card__end {
  margin-left: auto;
}
.quickstart-card__end {
  align-self: flex-end;
  margin-top: 10px;
  padding: 6px 10px;
  font-size: 13px;
  font-family: inherit;
  color: #3d3d47;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.quickstart-card__end:hover {
  background: #f0f0f7;
}
.quickstart-card__primary {
  padding: 7px 12px;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  color: #ffffff;
  background: #6965db;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.quickstart-card__primary:hover {
  background: #5b57c9;
}
`;

/** The shape-tool hint's highlight on the toolbar's shape buttons. */
const SHAPE_TOOL_HIGHLIGHT_STYLES = `
@keyframes quickstart-hint-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(105, 101, 219, 0); }
  50% { box-shadow: 0 0 0 6px rgba(105, 101, 219, 0.5); }
}
.excalidraw button[data-testid="toolbar-rectangle"],
.excalidraw button[data-testid="toolbar-diamond"],
.excalidraw button[data-testid="toolbar-ellipse"] {
  animation: quickstart-hint-pulse 1.6s ease-in-out infinite;
}
`;

export default QuickstartGuide;
