import type { ExcalidrawElement } from "@excalidraw/element/types";

import { appJotaiStore } from "./app-jotai";
import { LocalData, localStorageQuotaExceededAtom } from "./data/LocalData";

import type { FileManager } from "./data/FileManager";

/**
 * "Unsaved" here means the user's own gesture, not autosave: work counts
 * as unsaved until the user physically acts to save it (Save / Export /
 * Save as image from the menu, or their keyboard shortcuts), and it counts
 * as unsaved again after any further scene change. The scene's continuous
 * autosave to localStorage keeps the work recoverable in this browser, but
 * it is not the user clicking save -- the alert is exactly for that gap.
 *
 * Tracking is session-scoped: module state resets on reload, so content
 * restored from autosave reads as unsaved again until the user saves it.
 */

/** Latest scene state, as (non-deleted count, version sum, max version). */
let latestSignature = "0:0:0";
/** Scene state at the user's last explicit save; null = never this session. */
let savedSignature: string | null = null;

const signatureOf = (elements: readonly ExcalidrawElement[]) => {
  let count = 0;
  let sum = 0;
  let max = 0;
  for (const element of elements) {
    if (!element.isDeleted) {
      count++;
      sum += element.version;
      if (element.version > max) {
        max = element.version;
      }
    }
  }
  return `${count}:${sum}:${max}`;
};

/** Called from App.tsx's onChange for every scene change. */
export const noteSceneChange = (elements: readonly ExcalidrawElement[]) => {
  latestSignature = signatureOf(elements);
};

/**
 * The user physically acted to save: the menu's Save / Export / Save as
 * image items, their keyboard shortcuts, or exporting to Excalidraw+.
 */
export const markExplicitlySaved = () => {
  savedSignature = latestSignature;
};

/** Authored content that hasn't been explicitly saved since its last change. */
export const hasUnsavedExplicitWork = () =>
  latestSignature !== "0:0:0" && latestSignature !== savedSignature;

/** Test-only: reset the session-scoped tracking. */
export const resetUnsavedWorkTracking = () => {
  latestSignature = "0:0:0";
  savedSignature = null;
};

/**
 * Work that would be lost, or was never explicitly saved, if the page
 * closed right now:
 *  - content the user hasn't physically saved (see above)
 *  - image files whose save to persistent storage is still in flight
 *    (IndexedDB writes kicked off during unload aren't guaranteed to
 *    commit before the page dies)
 *  - scene changes that can't persist at all because the localStorage
 *    quota was exceeded (the scene's only autosave surface in the free
 *    editor is localStorage)
 *
 * In collaborative rooms the room's backend is the save surface and
 * Collab.tsx's own beforeUnload handles it, so the explicit-save signal
 * is skipped there (pass isCollaborating).
 *
 * Dependencies are injectable for tests; defaults read the live state.
 */
export const hasUnsavedWork = (
  elements: readonly ExcalidrawElement[],
  opts: {
    fileStorage?: FileManager;
    quotaExceeded?: boolean;
    isCollaborating?: boolean;
  } = {},
) => {
  const fileStorage = opts.fileStorage ?? LocalData.fileStorage;
  const quotaExceeded =
    opts.quotaExceeded ?? appJotaiStore.get(localStorageQuotaExceededAtom);
  const isCollaborating = opts.isCollaborating ?? false;

  return (
    fileStorage.shouldPreventUnload(elements) ||
    quotaExceeded ||
    (!isCollaborating && hasUnsavedExplicitWork())
  );
};

/**
 * Work that would be genuinely LOST if the page died right now: image
 * files whose IndexedDB writes may not commit during unload, or a scene
 * that can't persist at all (quota exceeded). Deliberately excludes the
 * explicit-save-pending signal -- localStorage autosave recovers that
 * work on reopen, so a close there loses nothing.
 *
 * This is the only condition worth the browser's own, unstyleable
 * beforeunload confirm: showing it for merely-not-explicitly-saved work
 * stacked the native alert over the styled Leave/Save popup, which reads
 * as two alarms for one decision.
 */
export const hasUnpersistedWork = (
  elements: readonly ExcalidrawElement[],
  opts: {
    fileStorage?: FileManager;
    quotaExceeded?: boolean;
  } = {},
) => {
  const fileStorage = opts.fileStorage ?? LocalData.fileStorage;
  const quotaExceeded =
    opts.quotaExceeded ?? appJotaiStore.get(localStorageQuotaExceededAtom);

  return fileStorage.shouldPreventUnload(elements) || quotaExceeded;
};
