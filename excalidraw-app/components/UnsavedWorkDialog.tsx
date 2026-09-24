import React from "react";

import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { alertTriangleIcon } from "@excalidraw/excalidraw/components/icons";

import { atom, useAtomValue, useSetAtom } from "../app-jotai";

import "./UnsavedWorkDialog.scss";

export type UnsavedWorkDialogState = {
  isOpen: boolean;
  /**
   * Runs when the user chooses Leave. Absent when there is nothing left to
   * leave to -- the close-page flow only opens this popup after the user
   * already chose to stay on the browser's own confirm, so its Leave just
   * dismisses.
   */
  onLeave?: () => void;
  /**
   * Saves the drawing as a PNG (and marks the work explicitly saved).
   * Provided by App.tsx, which owns the excalidrawAPI; returning a promise
   * makes the button show its own loading spinner while it runs.
   */
  onSave?: () => void | Promise<void>;
  /** Runs when the dialog closes without either choice (X / Escape). */
  onClose?: () => void;
};

const initialUnsavedWorkDialogState: UnsavedWorkDialogState = {
  isOpen: false,
};

export const unsavedWorkDialogStateAtom = atom<UnsavedWorkDialogState>(
  initialUnsavedWorkDialogState,
);

/**
 * The styled half of the unsaved-work alert (see unsavedWork.ts for the
 * detection): the in-app popup for the leave attempts we control --
 * currently, loading a different scene from the URL hash, which replaces
 * the scene on screen. The browser's own beforeunload confirm is reserved
 * for genuine data loss only (see hasUnpersistedWork), so the two never
 * stack over each other.
 *
 * Two buttons, per spec: Leave on the left, Save on the right -- Save is a
 * filled primary FilledButton (the Share button's own style) and exports
 * the drawing as a PNG. Tooltips on both, via the title attribute: the
 * FilledButton component doesn't forward one, so each button is wrapped.
 */
export const UnsavedWorkDialog: React.FC = () => {
  const { isOpen, onLeave, onSave, onClose } = useAtomValue(
    unsavedWorkDialogStateAtom,
  );
  const setDialogState = useSetAtom(unsavedWorkDialogStateAtom);

  if (!isOpen) {
    return null;
  }

  const close = (after?: () => void) => {
    setDialogState((state) => ({ ...state, isOpen: false }));
    after?.();
  };

  return (
    <Dialog onCloseRequest={() => close(onClose)} title={false} size={640}>
      <div className="UnsavedWorkDialog">
        <h3>You have unsaved changes</h3>
        <div className="UnsavedWorkDialog__Description">
          <div className="UnsavedWorkDialog__Description__icon">
            {alertTriangleIcon}
          </div>
          <div>
            Your drawing isn&apos;t saved yet. Save a copy, or leave it to this
            browser&apos;s autosave.
          </div>
        </div>
        <div className="UnsavedWorkDialog__Buttons">
          <span
            className="UnsavedWorkDialog__tooltip"
            data-testid="unsaved-work-leave-tooltip"
            title="Keep going without saving — your work stays in this browser's autosave"
          >
            <FilledButton
              variant="outlined"
              color="danger"
              size="large"
              label="Leave"
              onClick={() => close(onLeave)}
            />
          </span>
          <span
            className="UnsavedWorkDialog__tooltip"
            data-testid="unsaved-work-save-tooltip"
            title="Download your drawing as a PNG image"
          >
            <FilledButton
              color="primary"
              size="large"
              label="Save"
              onClick={async () => {
                await onSave?.();
                close();
              }}
            />
          </span>
        </div>
      </div>
    </Dialog>
  );
};
