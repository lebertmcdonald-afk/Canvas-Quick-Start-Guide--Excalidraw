import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Excalidraw } from "@excalidraw/excalidraw";

import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type { DataURL } from "@excalidraw/excalidraw/types";

import { FileManager } from "../data/FileManager";
import { localStorageQuotaExceededAtom } from "../data/LocalData";
import { Provider, appJotaiStore } from "../app-jotai";
import {
  hasUnsavedExplicitWork,
  hasUnsavedWork,
  markExplicitlySaved,
  noteSceneChange,
  resetUnsavedWorkTracking,
} from "../unsavedWork";
import {
  UnsavedWorkDialog,
  unsavedWorkDialogStateAtom,
} from "../components/UnsavedWorkDialog";

const makeImageElement = (id: string, fileId: string) =>
  ({
    id,
    type: "image",
    fileId,
    isDeleted: false,
  } as unknown as ExcalidrawElement);

const makeElement = (id: string, version = 1) =>
  ({
    id,
    type: "rectangle",
    version,
    isDeleted: false,
  } as unknown as ExcalidrawElement);

const makeFileManager = (
  saveFilesImpl: ConstructorParameters<
    typeof FileManager
  >[0]["saveFiles"] = async () => ({
    savedFiles: new Map(),
    erroredFiles: new Map(),
  }),
) =>
  new FileManager({
    getFiles: async () => ({
      loadedFiles: [],
      erroredFiles: new Map(),
    }),
    saveFiles: saveFilesImpl,
  });

const renderDialog = () =>
  render(
    <Provider store={appJotaiStore}>
      <Excalidraw>
        <UnsavedWorkDialog />
      </Excalidraw>
    </Provider>,
  );

const openDialog = (
  onLeave: () => void = () => {},
  onSave: () => void | Promise<void> = () => {},
) =>
  act(() =>
    appJotaiStore.set(unsavedWorkDialogStateAtom, {
      isOpen: true,
      onLeave,
      onSave,
    }),
  );

const resetState = () => {
  appJotaiStore.set(localStorageQuotaExceededAtom, false);
  appJotaiStore.set(unsavedWorkDialogStateAtom, { isOpen: false });
  resetUnsavedWorkTracking();
};

describe("hasUnsavedWork", () => {
  beforeEach(() => {
    resetState();
  });

  it("is false when saves have settled and storage is healthy", () => {
    expect(
      hasUnsavedWork([makeImageElement("a", "f1")], {
        fileStorage: makeFileManager(),
        quotaExceeded: false,
      }),
    ).toBe(false);
  });

  it("is true while an image file save is still in flight", () => {
    const fileStorage = makeFileManager(
      // never resolves: save stays in flight
      () => new Promise(() => {}),
    );
    // populates fileStorage's in-flight set (synchronously, before the await)
    void fileStorage.saveFiles({
      elements: [makeImageElement("a", "f1")],
      files: {
        f1: {
          id: "f1" as FileId,
          dataURL: "data:image/png;base64," as DataURL,
          mimeType: "image/png",
          created: 1,
          lastRetrieved: 1,
          version: 1,
        },
      },
    });

    expect(hasUnsavedWork([makeImageElement("a", "f1")], { fileStorage })).toBe(
      true,
    );
  });

  it("is true when the localStorage quota is exceeded (scene can't persist)", () => {
    expect(
      hasUnsavedWork([], {
        fileStorage: makeFileManager(),
        quotaExceeded: true,
      }),
    ).toBe(true);
  });

  it("reads the live quota atom by default", () => {
    appJotaiStore.set(localStorageQuotaExceededAtom, true);
    expect(hasUnsavedWork([], { fileStorage: makeFileManager() })).toBe(true);
  });
});

describe("explicit-save tracking (unsaved = user hasn't clicked save)", () => {
  beforeEach(() => {
    resetState();
  });

  it("an empty scene is never unsaved work", () => {
    noteSceneChange([]);
    expect(hasUnsavedExplicitWork()).toBe(false);
    expect(hasUnsavedWork([], { fileStorage: makeFileManager() })).toBe(false);
  });

  it("drawn content with no explicit save is unsaved work", () => {
    noteSceneChange([makeElement("a")]);
    expect(hasUnsavedExplicitWork()).toBe(true);
    expect(
      hasUnsavedWork([makeElement("a")], { fileStorage: makeFileManager() }),
    ).toBe(true);
  });

  it("autosave alone doesn't count -- only the user's save gesture does", () => {
    noteSceneChange([makeElement("a")]);
    noteSceneChange([makeElement("a", 2)]); // autosaved, still never saved
    expect(hasUnsavedExplicitWork()).toBe(true);

    markExplicitlySaved();
    expect(hasUnsavedExplicitWork()).toBe(false);
    expect(
      hasUnsavedWork([makeElement("a", 2)], { fileStorage: makeFileManager() }),
    ).toBe(false);
  });

  it("changes after the save make it unsaved again", () => {
    noteSceneChange([makeElement("a")]);
    markExplicitlySaved();
    noteSceneChange([makeElement("a"), makeElement("b")]);
    expect(hasUnsavedExplicitWork()).toBe(true);

    markExplicitlySaved();
    expect(hasUnsavedExplicitWork()).toBe(false);
  });

  it("deleted elements don't count as content", () => {
    noteSceneChange([
      { ...makeElement("a"), isDeleted: true } as unknown as ExcalidrawElement,
    ]);
    expect(hasUnsavedExplicitWork()).toBe(false);
  });

  it("collaborating suppresses the explicit-save signal, not files/quota", () => {
    noteSceneChange([makeElement("a")]);
    expect(
      hasUnsavedWork([makeElement("a")], {
        fileStorage: makeFileManager(),
        isCollaborating: true,
      }),
    ).toBe(false);

    appJotaiStore.set(localStorageQuotaExceededAtom, true);
    expect(
      hasUnsavedWork([], {
        fileStorage: makeFileManager(),
        isCollaborating: true,
      }),
    ).toBe(true);
  });
});

describe("UnsavedWorkDialog", () => {
  beforeEach(() => {
    resetState();
  });

  it("renders nothing until opened", async () => {
    renderDialog();
    await waitFor(() => {
      // wait for the editor to mount before asserting absence
      expect(document.querySelector(".excalidraw")).not.toBe(null);
    });
    expect(document.body).not.toHaveTextContent("You have unsaved changes");
  });

  it("Leave runs onLeave and closes; Save runs onSave and closes", async () => {
    renderDialog();
    const onLeave = vi.fn();
    const onSave = vi.fn();

    openDialog(onLeave, onSave);
    await waitFor(() => {
      expect(document.body).toHaveTextContent("You have unsaved changes");
    });

    fireEvent.click(
      [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Leave"),
      )!,
    );
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(document.body).not.toHaveTextContent("You have unsaved changes");
    });

    openDialog(onLeave, onSave);
    await waitFor(() => {
      expect(document.body).toHaveTextContent("You have unsaved changes");
    });
    fireEvent.click(
      [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Save"),
      )!,
    );
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(document.body).not.toHaveTextContent("You have unsaved changes");
    });
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("both buttons carry tooltips; Save is the Share-styled primary", async () => {
    renderDialog();
    openDialog();

    await waitFor(() => {
      expect(document.body).toHaveTextContent("You have unsaved changes");
    });

    const leaveTooltip = document.querySelector(
      '[data-testid="unsaved-work-leave-tooltip"]',
    )!;
    expect(leaveTooltip.getAttribute("title")).toContain("autosave");

    const saveTooltip = document.querySelector(
      '[data-testid="unsaved-work-save-tooltip"]',
    )!;
    expect(saveTooltip.getAttribute("title")).toContain("PNG");

    // FilledButton (ExcButton) filled-primary is the Share button's own
    // style; the Save button inside its tooltip wrapper carries it
    const saveButton = saveTooltip.querySelector("button")!;
    expect(saveButton.classList.contains("ExcButton--color-primary")).toBe(
      true,
    );
    expect(saveButton.classList.contains("ExcButton--variant-filled")).toBe(
      true,
    );
    expect(saveButton.textContent).toContain("Save");
  });
});
