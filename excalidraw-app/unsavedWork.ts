import type { ExcalidrawElement } from "@excalidraw/element/types";

import { appJotaiStore } from "./app-jotai";
import { LocalData, localStorageQuotaExceededAtom } from "./data/LocalData";

import type { FileManager } from "./data/FileManager";

/**
 * Work that would be lost if the page closed right now:
 *  - image files whose save to persistent storage is still in flight
 *    (IndexedDB writes kicked off during unload aren't guaranteed to
 *    commit before the page dies)
 *  - scene changes that can't persist at all because the localStorage
 *    quota was exceeded (the scene's only save surface in the free
 *    editor is localStorage)
 *
 * Collaborative rooms have their own stricter check (unsynced firebase
 * changes) in Collab.tsx's beforeUnload handler.
 *
 * Dependencies are injectable for tests; defaults read the live state.
 */
export const hasUnsavedWork = (
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
