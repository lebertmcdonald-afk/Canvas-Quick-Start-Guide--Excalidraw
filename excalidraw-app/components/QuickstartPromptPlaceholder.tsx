import React from "react";

/**
 * Day 15 scaffold only: no styling, no dismiss button, no interactivity.
 * `pointerEvents: "none"` means it can never intercept a click, so the
 * Day 15 P0 (a user can start drawing without ever touching the prompt)
 * holds by construction rather than by careful placement.
 *
 * Day 16 replaces this with the real hint content and interactivity.
 */
export const QuickstartPromptPlaceholder: React.FC<{
  isNewUser: boolean | null;
}> = ({ isNewUser }) => {
  if (!isNewUser) {
    return null;
  }

  return (
    <div
      data-testid="quickstart-prompt-placeholder"
      style={{
        position: "fixed",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      Quickstart prompt placeholder — Day 16 adds real content + interactivity
    </div>
  );
};
