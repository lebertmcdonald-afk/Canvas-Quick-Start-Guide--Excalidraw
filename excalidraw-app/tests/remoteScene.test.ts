import { beforeEach, describe, expect, it } from "vitest";

import {
  isRemoteElementVersion,
  markRemoteSceneUpdate,
  resetRemoteSceneUpdate,
} from "../quickstart/remoteScene";

describe("remoteScene", () => {
  beforeEach(() => {
    resetRemoteSceneUpdate();
  });

  it("reads a marked element's version as remote, regardless of what runs in between", async () => {
    // Regression test for the real bug: Collab used to wrap updateScene()
    // in a synchronous begin/end flag, but Excalidraw's onChange fires
    // *asynchronously* relative to that call (observed 5-10ms later
    // against a live collab session) -- so the flag was always already
    // cleared by the time onChange checked it. Tracking by id+version
    // instead must survive an arbitrary gap, not just a synchronous one.
    markRemoteSceneUpdate([{ id: "el1", version: 3 }]);

    // simulate real work happening between the write and onChange firing
    await new Promise((resolve) => setTimeout(resolve, 20));
    await Promise.resolve();
    await Promise.resolve();

    expect(isRemoteElementVersion({ id: "el1", version: 3 })).toBe(true);
  });

  it("stops matching once the element is edited again (version bumped)", () => {
    markRemoteSceneUpdate([{ id: "el1", version: 3 }]);
    expect(isRemoteElementVersion({ id: "el1", version: 3 })).toBe(true);

    // the local user (or a later remote write) edits it further
    expect(isRemoteElementVersion({ id: "el1", version: 4 })).toBe(false);
  });

  it("doesn't match an element that was never marked", () => {
    markRemoteSceneUpdate([{ id: "el1", version: 3 }]);
    expect(isRemoteElementVersion({ id: "el2", version: 1 })).toBe(false);
  });

  it("tracks multiple elements from the same remote write independently", () => {
    markRemoteSceneUpdate([
      { id: "el1", version: 1 },
      { id: "el2", version: 5 },
    ]);
    expect(isRemoteElementVersion({ id: "el1", version: 1 })).toBe(true);
    expect(isRemoteElementVersion({ id: "el2", version: 5 })).toBe(true);
    expect(isRemoteElementVersion({ id: "el2", version: 6 })).toBe(false);
  });
});
