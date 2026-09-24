import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import {
  SAVE_PATH_HIGHLIGHT_STYLES,
  useMenuPanelOpen,
} from "../quickstart/QuickstartGuide";

/**
 * The follow-up to choosing Stay on the browser's close confirm (App.tsx's
 * unload handler opens the menu and activates this): while the main menu
 * is open, every save-path item in it pulses -- "Save to current file",
 * Export, "Export image..." -- pointing straight at the action the close
 * attempt was warning about.
 *
 * One-shot by design: it ends when the menu closes, whether the user
 * saved or not, rather than re-opening the menu at them.
 */
export const SavePathNudge: React.FC<{
  active: boolean;
  onDone: () => void;
}> = ({ active, onDone }) => {
  const menuOpen = useMenuPanelOpen(active);
  const hadMenuOpenRef = useRef(false);

  useEffect(() => {
    if (!active) {
      hadMenuOpenRef.current = false;
      return;
    }
    if (menuOpen) {
      hadMenuOpenRef.current = true;
    } else if (hadMenuOpenRef.current) {
      onDone();
    }
  }, [active, menuOpen, onDone]);

  if (!active || !menuOpen) {
    return null;
  }

  return createPortal(
    <style data-testid="save-path-nudge-styles">
      {SAVE_PATH_HIGHLIGHT_STYLES}
    </style>,
    document.body,
  );
};
