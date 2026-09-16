import React from "react";
import { createPortal } from "react-dom";

/**
 * Day 15 scaffold only: no styling, no dismiss button, no interactivity.
 * `pointerEvents: "none"` means it can never intercept a click, so the
 * Day 15 P0 (a user can start drawing without ever touching the prompt)
 * holds by construction rather than by careful placement.
 *
 * Rendered via a portal to document.body rather than inline: this
 * component is passed as a child of <Excalidraw>, which renders it deep
 * inside LayerUI's tunneled-children slot (see LayerUI.tsx) -- itself
 * nested inside the `.excalidraw` root, which sets `overflow: hidden`.
 * A portal sidesteps that ancestry entirely so `position: fixed` reliably
 * means "the actual browser viewport," not whatever box it happens to be
 * nested in.
 *
 * Day 16 replaces this with the real hint content and interactivity.
 */
export const QuickstartPromptPlaceholder: React.FC<{
  isNewUser: boolean | null;
}> = ({ isNewUser }) => {
  if (!isNewUser) {
    return null;
  }

  return createPortal(
    <div
      data-testid="quickstart-prompt-placeholder"
      style={{
        position: "fixed",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      Quickstart prompt placeholder — Day 16 adds real content + interactivity
    </div>,
    document.body,
  );
};
