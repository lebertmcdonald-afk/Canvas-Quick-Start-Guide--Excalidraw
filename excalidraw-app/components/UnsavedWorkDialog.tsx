import React from "react";

import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { alertTriangleIcon } from "@excalidraw/excalidraw/components/icons";

import { atom, useAtomValue, useSetAtom } from "../app-jotai";

import "./UnsavedWorkDialog.scss";

export type UnsavedWorkDialogState = {
  isOpen: boolean;
  /** runs when the user chooses to leave despite the warning */
  onConfirm: () => void;
  /** runs when the user chooses to stay; the URL should be restored */
  onCancel?: () => void;
};

const initialUnsavedWorkDialogState: UnsavedWorkDialogState = {
  isOpen: false,
  onConfirm: () => {},
};

export const unsavedWorkDialogStateAtom = atom<UnsavedWorkDialogState>(
  initialUnsavedWorkDialogState,
);

/**
 * The styled half of the unsaved-work alert (see unsavedWork.ts for the
 * detection). Closing the tab itself can only trigger the browser's
 * native, unstyleable beforeunload confirm, so this dialog covers the
 * leave attempts we control -- currently, loading a different scene from
 * the URL hash, which replaces the scene on screen.
 *
 * Uses the app's existing Dialog + FilledButton components, matching the
 * OverwriteConfirm "unsaved changes" dialog's look.
 */
export const UnsavedWorkDialog: React.FC = () => {
  const { isOpen, onConfirm, onCancel } = useAtomValue(
    unsavedWorkDialogStateAtom,
  );
  const setDialogState = useSetAtom(unsavedWorkDialogStateAtom);

  if (!isOpen) {
    return null;
  }

  const close = (action: () => void) => {
    setDialogState((state) => ({ ...state, isOpen: false }));
    action();
  };

  return (
    <Dialog
      onCloseRequest={() => close(() => onCancel?.())}
      title={false}
      size={640}
    >
      <div className="UnsavedWorkDialog">
        <h3>You have unsaved changes</h3>
        <div className="UnsavedWorkDialog__Description">
          <div className="UnsavedWorkDialog__Description__icon">
            {alertTriangleIcon}
          </div>
          <div>
            Some of your work hasn&apos;t finished saving. If you leave now, it
            may be lost.
          </div>
        </div>
        <div className="UnsavedWorkDialog__Buttons">
          <FilledButton
            variant="outlined"
            color="danger"
            size="large"
            label="Leave anyway"
            onClick={() => close(onConfirm)}
          />
          <FilledButton
            color="primary"
            size="large"
            label="Stay"
            onClick={() => close(() => onCancel?.())}
          />
        </div>
      </div>
    </Dialog>
  );
};
