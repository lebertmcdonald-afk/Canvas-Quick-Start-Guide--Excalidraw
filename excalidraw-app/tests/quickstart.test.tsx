import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Excalidraw } from "@excalidraw/excalidraw";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { appJotaiStore, Provider } from "../app-jotai";
import { AppMainMenu } from "../components/AppMainMenu";
import {
  findFirstUserConnection,
  findFirstUserLabel,
  findFirstUserMark,
  nextHint,
} from "../quickstart/behavior";
import { QuickstartHelpButton } from "../quickstart/QuickstartHelpButton";
import { QuickstartGuide } from "../quickstart/QuickstartGuide";
import {
  activeHintAtom,
  completedHintsAtom,
  guideEndedAtom,
  guideForcedVisibleAtom,
  guideOptedInAtom,
} from "../quickstart/state";

import {
  notifyExplicitSave,
  useQuickstartGuide,
} from "../quickstart/useQuickstartGuide";

import type { HintId } from "../quickstart/types";
import type { ReactNode } from "react";

const makeElement = (
  id: string,
  type: OrderedExcalidrawElement["type"],
  extras: Record<string, unknown> = {},
) =>
  ({
    id,
    type,
    isDeleted: extras.isDeleted ?? false,
    ...extras,
  } as unknown as OrderedExcalidrawElement);

/** A bound text label on a shape -- containerId set -- vs. makeElement("id",
 * "text"), which is a freestanding text box and must NOT count as a label. */
const makeLabel = (id: string, containerId: string, isDeleted = false) =>
  ({
    id,
    type: "text",
    containerId,
    isDeleted,
  } as unknown as OrderedExcalidrawElement);

/** An arrow, optionally bound at each end -- pass null for an unbound end. */
const makeArrow = (
  id: string,
  startElementId: string | null,
  endElementId: string | null,
  isDeleted = false,
) =>
  ({
    id,
    type: "arrow",
    startBinding: startElementId ? { elementId: startElementId } : null,
    endBinding: endElementId ? { elementId: endElementId } : null,
    isDeleted,
  } as unknown as OrderedExcalidrawElement);

/** In-memory guide state only -- what a page reload clears. */
const resetGuideAtoms = () => {
  appJotaiStore.set(guideOptedInAtom, false);
  appJotaiStore.set(activeHintAtom, null);
  appJotaiStore.set(completedHintsAtom, []);
  appJotaiStore.set(guideEndedAtom, false);
  appJotaiStore.set(guideForcedVisibleAtom, false);
};

const resetGuideState = () => {
  // saved progress would otherwise leak from one test's localStorage into
  // the next one's "fresh" mount
  localStorage.removeItem("excalidraw-quickstart-progress");
  resetGuideAtoms();
};

const renderGuideHook = (isNewUser: boolean | null) => {
  const markGuideSeen = vi.fn();
  // the hook's atoms live in appJotaiStore in the real app (App.tsx's
  // <Provider>), so the tests must mount the same store, not jotai's
  // default one
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={appJotaiStore}>{children}</Provider>
  );
  const { result } = renderHook(
    () => useQuickstartGuide(isNewUser, markGuideSeen),
    { wrapper },
  );
  return { result, markGuideSeen };
};

const optInAndShowShapeHint = (result: {
  current: ReturnType<typeof useQuickstartGuide>;
}) => {
  act(() => result.current.optIn());
  // the auto-activation effect fires within act(); assert to be sure
  expect(result.current.activeHint).toBe("shape-tool");
};

describe("quickstart behavior logic", () => {
  it("nextHint returns the first implemented, uncompleted hint", () => {
    expect(nextHint([])).toBe("shape-tool");
    expect(nextHint(["shape-tool"])).toBe("labeling");
    expect(nextHint(["shape-tool", "labeling"])).toBe("connecting");
    expect(nextHint(["shape-tool", "labeling", "connecting"])).toBe("save");
    expect(
      nextHint(["shape-tool", "labeling", "connecting", "save"]),
    ).toBeNull();
    expect(nextHint(["labeling"])).toBe("shape-tool");
  });

  it("findFirstUserMark detects a newly created shape, not known or deleted elements", () => {
    const known = new Set(["a"]);
    expect(
      findFirstUserMark(known, [
        makeElement("a", "rectangle"),
        makeElement("b", "ellipse"),
      ])?.id,
    ).toBe("b");
    // already-known id: not new
    expect(
      findFirstUserMark(known, [makeElement("a", "rectangle")]),
    ).toBeNull();
    // deleted: not a mark
    expect(
      findFirstUserMark(known, [
        makeElement("b", "rectangle", { isDeleted: true }),
      ]),
    ).toBeNull();
    // import-style content: not a user mark
    expect(findFirstUserMark(known, [makeElement("b", "image")])).toBeNull();
  });

  it("findFirstUserLabel detects a newly bound text element, not a freestanding one", () => {
    const known = new Set(["a"]);
    expect(
      findFirstUserLabel(known, [
        makeElement("a", "rectangle"),
        makeLabel("b", "shape1"),
      ])?.id,
    ).toBe("b");
    // freestanding text (no container): not a label
    expect(findFirstUserLabel(known, [makeElement("b", "text")])).toBeNull();
    // already-known id: not new
    expect(findFirstUserLabel(known, [makeLabel("a", "shape1")])).toBeNull();
    // deleted: not a label
    expect(
      findFirstUserLabel(known, [makeLabel("b", "shape1", true)]),
    ).toBeNull();
  });

  it("findFirstUserConnection detects an arrow bound at both ends to different shapes", () => {
    const known = new Set(["a", "b"]);
    expect(
      findFirstUserConnection(known, [
        makeElement("a", "rectangle"),
        makeElement("b", "ellipse"),
        makeArrow("c", "a", "b"),
      ])?.id,
    ).toBe("c");
    // only one end bound: not a connection
    expect(
      findFirstUserConnection(known, [makeArrow("c", "a", null)]),
    ).toBeNull();
    // neither end bound: not a connection
    expect(
      findFirstUserConnection(known, [makeArrow("c", null, null)]),
    ).toBeNull();
    // both ends bound to the *same* shape: doesn't connect two steps
    expect(
      findFirstUserConnection(known, [makeArrow("c", "a", "a")]),
    ).toBeNull();
    // already-known id: not new
    expect(
      findFirstUserConnection(known, [makeArrow("a", "a", "b")]),
    ).toBeNull();
    // deleted: not a connection
    expect(
      findFirstUserConnection(known, [makeArrow("c", "a", "b", true)]),
    ).toBeNull();
    // an arrow whose endpoints sit on two different shapes counts even
    // with no bindings -- Excalidraw leaves a drag that starts on a
    // shape's bound label unbound, and the user still connected two steps
    expect(
      findFirstUserConnection(new Set(), [
        makeElement("el1", "rectangle", {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        }),
        makeElement("el2", "rectangle", {
          x: 300,
          y: 0,
          width: 100,
          height: 100,
        }),
        makeElement("link", "arrow", {
          x: 50,
          y: 50,
          points: [
            [0, 0],
            [280, 0],
          ],
          startBinding: null,
          endBinding: null,
        }),
      ])?.id,
    ).toBe("link");
    // ...but an arrow drawn on empty canvas still isn't a connection
    expect(
      findFirstUserConnection(new Set(), [
        makeElement("el1", "rectangle", {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        }),
        makeElement("stray", "arrow", {
          x: 600,
          y: 600,
          points: [
            [0, 0],
            [80, 40],
          ],
          startBinding: null,
          endBinding: null,
        }),
      ]),
    ).toBeNull();
  });
});

describe("quickstart guide UI", () => {
  beforeEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  const renderUi = (props: {
    isVisible?: boolean;
    optedIn?: boolean;
    activeHint?: HintId | null;
  }) => {
    const onOptIn = vi.fn();
    const onEndGuide = vi.fn();
    render(
      <QuickstartGuide
        isVisible={props.isVisible ?? true}
        optedIn={props.optedIn ?? false}
        activeHint={props.activeHint ?? null}
        onOptIn={onOptIn}
        onEndGuide={onEndGuide}
      />,
    );
    return { onOptIn, onEndGuide };
  };

  it("renders nothing when the guide isn't visible", () => {
    renderUi({ isVisible: false, optedIn: true, activeHint: "shape-tool" });
    expect(document.querySelector('[data-testid^="quickstart-"]')).toBe(null);
  });

  it("the prompt offers opt-in and decline, both working", () => {
    const { onOptIn, onEndGuide } = renderUi({ optedIn: false });
    expect(document.body).toHaveTextContent("Making your first diagram?");
    // the hover/border styling for the buttons mounts with the prompt
    expect(
      document.querySelector('[data-testid="quickstart-button-styles"]'),
    ).not.toBe(null);

    fireEvent.click(
      document.querySelector('[data-testid="quickstart-opt-in"]')!,
    );
    expect(onOptIn).toHaveBeenCalledTimes(1);

    fireEvent.click(
      document.querySelector('[data-testid="quickstart-decline"]')!,
    );
    expect(onEndGuide).toHaveBeenCalledTimes(1);
  });

  it('the prompt no longer carries the "How to start" link (it moved to help)', () => {
    renderUi({ optedIn: false });
    expect(
      document.querySelector('[data-testid="quickstart-how-to-start"]'),
    ).toBe(null);
    expect(document.body).not.toHaveTextContent("How to start");
  });

  it("the shape-tool hint's End guide button matches the Share button style", () => {
    renderUi({ optedIn: true, activeHint: "shape-tool" });
    const endGuide = document.querySelector<HTMLButtonElement>(
      '[data-testid="quickstart-end-guide"]',
    )!;
    expect(endGuide.classList.contains("quickstart-btn--primary")).toBe(true);
  });

  it("the labeling hint shows PRD copy and an explicit end control", () => {
    const { onEndGuide } = renderUi({ optedIn: true, activeHint: "labeling" });
    expect(document.body).toHaveTextContent(
      "Double-click a shape to name this step.",
    );
    // no shape-tool-specific toolbar highlight while labeling is active
    expect(
      document.querySelector('[data-testid="quickstart-shape-tool-styles"]'),
    ).toBe(null);

    fireEvent.click(
      document.querySelector('[data-testid="quickstart-end-guide"]')!,
    );
    expect(onEndGuide).toHaveBeenCalledTimes(1);
  });

  it("the connecting hint shows PRD copy and an explicit end control", () => {
    const { onEndGuide } = renderUi({
      optedIn: true,
      activeHint: "connecting",
    });
    expect(document.body).toHaveTextContent(
      "Draw an arrow to connect two shapes.",
    );
    expect(
      document.querySelector('[data-testid="quickstart-shape-tool-styles"]'),
    ).toBe(null);

    fireEvent.click(
      document.querySelector('[data-testid="quickstart-end-guide"]')!,
    );
    expect(onEndGuide).toHaveBeenCalledTimes(1);
  });

  it("the save hint shows where it's stored and how to save a real copy", () => {
    const { onEndGuide } = renderUi({ optedIn: true, activeHint: "save" });
    expect(document.body).toHaveTextContent(
      "Your drawing auto-saves in this browser. Use the menu to save a copy.",
    );
    expect(
      document.querySelector('[data-testid="quickstart-shape-tool-styles"]'),
    ).toBe(null);

    fireEvent.click(
      document.querySelector('[data-testid="quickstart-end-guide"]')!,
    );
    expect(onEndGuide).toHaveBeenCalledTimes(1);
  });

  it("the shape-tool hint shows the toolbar highlight and an explicit end control", () => {
    const { onEndGuide } = renderUi({
      optedIn: true,
      activeHint: "shape-tool",
    });
    expect(document.body).toHaveTextContent("draw your first shape");
    expect(
      document.querySelector(
        '[data-testid="quickstart-hint-shape-tool-styles"]',
      ),
    ).not.toBe(null);
    expect(
      document.querySelector('[data-testid="quickstart-button-styles"]'),
    ).not.toBe(null);

    fireEvent.click(
      document.querySelector('[data-testid="quickstart-end-guide"]')!,
    );
    expect(onEndGuide).toHaveBeenCalledTimes(1);
  });

  it("no highlight stylesheet outside the shape-tool hint", () => {
    renderUi({ optedIn: true, activeHint: null });
    expect(
      document.querySelector(
        '[data-testid="quickstart-hint-shape-tool-styles"]',
      ),
    ).toBe(null);
    expect(document.querySelector('[data-testid^="quickstart-"]')).toBe(null);
  });

  it("the connecting hint tells the user to draw a connecting arrow", () => {
    renderUi({ optedIn: true, activeHint: "connecting" });
    expect(document.body).toHaveTextContent(
      "Draw an arrow to connect two shapes.",
    );
    expect(
      document.querySelector(
        '[data-testid="quickstart-hint-connecting-styles"]',
      ),
    ).not.toBe(null);
  });

  it("shifts the card below the welcome toolbar tooltip while it's visible", async () => {
    const excalidrawRoot = document.createElement("div");
    excalidrawRoot.className = "excalidraw";
    const tooltip = document.createElement("div");
    tooltip.className = "welcome-screen-decor-hint--toolbar";
    tooltip.getBoundingClientRect = () =>
      ({ top: 90, bottom: 150, height: 60 } as unknown as DOMRect);
    excalidrawRoot.appendChild(tooltip);
    document.body.appendChild(excalidrawRoot);

    renderUi({ optedIn: false });
    const prompt = () =>
      document.querySelector<HTMLDivElement>(
        '[data-testid="quickstart-prompt"]',
      )!;
    await waitFor(() => expect(prompt().style.top).toBe("158px"));

    // once the user draws, the welcome screen (and its tooltip) unmounts
    // and the card returns to its default spot
    excalidrawRoot.remove();
    await waitFor(() => expect(prompt().style.top).toBe("76px"));
  });

  it("a media-query-hidden tooltip reads as absent", async () => {
    const excalidrawRoot = document.createElement("div");
    excalidrawRoot.className = "excalidraw";
    const tooltip = document.createElement("div");
    tooltip.className = "welcome-screen-decor-hint--toolbar";
    // display:none elements report an all-zero rect
    tooltip.getBoundingClientRect = () =>
      ({ top: 0, bottom: 0, height: 0 } as unknown as DOMRect);
    excalidrawRoot.appendChild(tooltip);
    document.body.appendChild(excalidrawRoot);

    renderUi({ optedIn: false });
    const prompt = () =>
      document.querySelector<HTMLDivElement>(
        '[data-testid="quickstart-prompt"]',
      )!;
    await waitFor(() => expect(prompt().style.top).toBe("76px"));
  });
});

describe("quickstart guide behavior (useQuickstartGuide)", () => {
  beforeEach(() => {
    resetGuideState();
    cleanup();
  });

  it("exposure persists the seen flag exactly once for a new user only", () => {
    const { markGuideSeen } = renderGuideHook(true);
    expect(markGuideSeen).toHaveBeenCalledTimes(1);

    cleanup();
    const notNew = renderGuideHook(false);
    expect(notNew.markGuideSeen).not.toHaveBeenCalled();
  });

  it("a label flagged remote by a raced creation echo still completes once locally edited", () => {
    // In a collab room, the local user's just-created label can be flagged
    // remote on its creation onChange (the room's echo landed first at the
    // same id+version). Baselineing it as satisfied made the labeling hint
    // permanently stuck -- the user named the shape and nothing happened.
    const { result } = renderGuideHook(true);
    optInAndShowShapeHint(result);
    act(() =>
      result.current.notifySceneChange([makeElement("s1", "rectangle")]),
    );

    const remoteAtCreation = (element: { id: string }) => element.id === "t1";
    const label = makeLabel("t1", "s1");

    // creation onChange, racing the echo: suppressed, correctly
    act(() =>
      result.current.notifySceneChange(
        [makeElement("s1", "rectangle"), label],
        { isRemoteElement: remoteAtCreation },
      ),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);

    // the user's own typing bumps the version clear of the remote record:
    // the same label must now complete the hint, not stay swallowed
    act(() =>
      result.current.notifySceneChange([
        makeElement("s1", "rectangle"),
        makeLabel("t1", "s1"),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
    ]);
  });

  it("the user authoring a shape completes the hint on its own, once, and advances to labeling", () => {
    const { result } = renderGuideHook(true);
    optInAndShowShapeHint(result);

    act(() => result.current.notifySceneChange([])); // baseline
    act(() =>
      result.current.notifySceneChange([makeElement("el1", "rectangle")]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);
    expect(result.current.activeHint).toBe("labeling");

    // a second shape must not resurrect or duplicate shape-tool, and must
    // not complete labeling either -- it's not a bound label
    act(() =>
      result.current.notifySceneChange([
        makeElement("el1", "rectangle"),
        makeElement("el2", "ellipse"),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);
    expect(result.current.activeHint).toBe("labeling");
  });

  it("labeling a shape completes that hint on its own, once; a freestanding text box doesn't", () => {
    const { result } = renderGuideHook(true);
    optInAndShowShapeHint(result);

    act(() => result.current.notifySceneChange([])); // baseline
    act(() =>
      result.current.notifySceneChange([makeElement("el1", "rectangle")]),
    );
    expect(result.current.activeHint).toBe("labeling");

    // a freestanding text box (not bound to the shape) must not complete it
    act(() =>
      result.current.notifySceneChange([
        makeElement("el1", "rectangle"),
        makeElement("txt1", "text"),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);
    expect(result.current.activeHint).toBe("labeling");

    // double-clicking the shape and typing a label: a bound text element
    act(() =>
      result.current.notifySceneChange([
        makeElement("el1", "rectangle"),
        makeElement("txt1", "text"),
        makeLabel("lbl1", "el1"),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
    ]);
    expect(result.current.activeHint).toBe("connecting");

    // a second label must not duplicate the completion
    act(() =>
      result.current.notifySceneChange([
        makeElement("el1", "rectangle"),
        makeElement("txt1", "text"),
        makeLabel("lbl1", "el1"),
        makeLabel("lbl2", "el1"),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
    ]);
  });

  const completeShapeToolAndLabeling = (result: {
    current: ReturnType<typeof useQuickstartGuide>;
  }) => {
    optInAndShowShapeHint(result);
    act(() => result.current.notifySceneChange([])); // baseline
    act(() =>
      result.current.notifySceneChange([makeElement("el1", "rectangle")]),
    );
    act(() =>
      result.current.notifySceneChange([
        makeElement("el1", "rectangle"),
        makeElement("el2", "ellipse"),
        makeLabel("lbl1", "el1"),
      ]),
    );
    expect(result.current.activeHint).toBe("connecting");
  };

  it("connecting two shapes with an arrow completes that hint on its own, once; a loose or self-looped arrow doesn't", () => {
    const { result } = renderGuideHook(true);
    completeShapeToolAndLabeling(result);

    // one end unbound: not a connection
    act(() =>
      result.current.notifySceneChange([
        makeElement("el1", "rectangle"),
        makeElement("el2", "ellipse"),
        makeLabel("lbl1", "el1"),
        makeArrow("arrow1", "el1", null),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
    ]);
    expect(result.current.activeHint).toBe("connecting");

    // both ends bound to the same shape: doesn't connect two steps
    act(() =>
      result.current.notifySceneChange([
        makeElement("el1", "rectangle"),
        makeElement("el2", "ellipse"),
        makeLabel("lbl1", "el1"),
        makeArrow("arrow1", "el1", "el1"),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
    ]);
    expect(result.current.activeHint).toBe("connecting");

    // a real arrow connecting the two shapes
    act(() =>
      result.current.notifySceneChange([
        makeElement("el1", "rectangle"),
        makeElement("el2", "ellipse"),
        makeLabel("lbl1", "el1"),
        makeArrow("arrow2", "el1", "el2"),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
      "connecting",
    ]);
    expect(result.current.activeHint).toBe("save");

    // a second connecting arrow must not duplicate the completion
    act(() =>
      result.current.notifySceneChange([
        makeElement("el1", "rectangle"),
        makeElement("el2", "ellipse"),
        makeLabel("lbl1", "el1"),
        makeArrow("arrow2", "el1", "el2"),
        makeArrow("arrow3", "el1", "el2"),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
      "connecting",
    ]);
  });

  it("an arrow created unbound and bound a moment later still completes connecting", () => {
    const { result } = renderGuideHook(true);
    completeShapeToolAndLabeling(result);

    const shapes = [
      makeElement("el1", "rectangle"),
      makeElement("el2", "ellipse"),
      makeLabel("lbl1", "el1"),
    ];
    // Excalidraw inserts the arrow first...
    act(() =>
      result.current.notifySceneChange([
        ...shapes,
        makeArrow("arrow1", null, null),
      ]),
    );
    expect(result.current.activeHint).toBe("connecting");

    // ...then binds that same id, which is when it becomes a connection
    act(() =>
      result.current.notifySceneChange([
        ...shapes,
        makeArrow("arrow1", "el1", "el2"),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
      "connecting",
    ]);
    expect(result.current.activeHint).toBe("save");
  });

  it("an arrow whose endpoints sit on two shapes completes connecting without bindings", () => {
    const { result } = renderGuideHook(true);
    completeShapeToolAndLabeling(result);

    const shapes = [
      makeElement("el1", "rectangle", { x: 0, y: 0, width: 100, height: 100 }),
      makeElement("el2", "ellipse", { x: 300, y: 0, width: 100, height: 100 }),
      makeLabel("lbl1", "el1"),
    ];
    act(() => result.current.notifySceneChange(shapes));
    expect(result.current.activeHint).toBe("connecting");

    act(() =>
      result.current.notifySceneChange([
        ...shapes,
        makeElement("drawn", "arrow", {
          x: 50,
          y: 50,
          points: [
            [0, 0],
            [280, 0],
          ],
          startBinding: null,
          endBinding: null,
        }),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
      "connecting",
    ]);
    expect(result.current.activeHint).toBe("save");
  });

  const remoteMeta = (remoteIds: readonly string[]) => ({
    isRemoteElement: (element: OrderedExcalidrawElement) =>
      remoteIds.includes(element.id),
  });

  it("a remote collaborator's edits don't complete a hint or dismiss the prompt", () => {
    const { result } = renderGuideHook(true);
    expect(result.current.isVisible).toBe(true);

    // P1 is the *local* user starting to draw; a collaborator's shape
    // must leave the opt-in prompt up
    act(() =>
      result.current.notifySceneChange(
        [makeElement("remote1", "rectangle")],
        remoteMeta(["remote1"]),
      ),
    );
    expect(appJotaiStore.get(guideEndedAtom)).toBe(false);
    expect(result.current.isVisible).toBe(true);

    optInAndShowShapeHint(result);
    act(() =>
      result.current.notifySceneChange(
        [
          makeElement("remote1", "rectangle"),
          makeElement("remote2", "diamond"),
        ],
        remoteMeta(["remote1", "remote2"]),
      ),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([]);
    expect(result.current.activeHint).toBe("shape-tool");

    // the local user's own mark still completes it, even in the same
    // batch as the collaborator's still-present elements
    act(() =>
      result.current.notifySceneChange(
        [
          makeElement("remote1", "rectangle"),
          makeElement("remote2", "diamond"),
          makeElement("local1", "ellipse"),
        ],
        remoteMeta(["remote1", "remote2"]),
      ),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);
    expect(result.current.activeHint).toBe("labeling");
  });

  it("a stale remote element sitting unchanged doesn't poison later local completions (regression)", () => {
    // Guards the whole-batch-boolean bug: onChange always reports the
    // *full* scene, not a diff, so once any element had ever been
    // remote, a coarse "is this batch remote" flag would misread every
    // later onChange as remote forever, breaking local completion for
    // the rest of the session.
    const { result } = renderGuideHook(true);
    optInAndShowShapeHint(result);

    act(() =>
      result.current.notifySceneChange(
        [makeElement("remote1", "rectangle")],
        remoteMeta(["remote1"]),
      ),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([]);

    // remote1 is still present and unchanged; meta no longer marks
    // anything remote (simulating time passing, a purely local onChange)
    act(() =>
      result.current.notifySceneChange([
        makeElement("remote1", "rectangle"),
        makeElement("local1", "ellipse"),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);
  });

  const completeThroughConnecting = (result: {
    current: ReturnType<typeof useQuickstartGuide>;
  }) => {
    completeShapeToolAndLabeling(result);
    act(() =>
      result.current.notifySceneChange([
        makeElement("el1", "rectangle"),
        makeElement("el2", "ellipse"),
        makeLabel("lbl1", "el1"),
        makeArrow("arrow1", "el1", "el2"),
      ]),
    );
    expect(result.current.activeHint).toBe("save");
  };

  it("an explicit save completes the save hint on its own, once; scene changes alone don't", () => {
    const { result } = renderGuideHook(true);
    completeThroughConnecting(result);

    // save isn't scene-content-driven: drawing more shapes must not
    // complete it via notifySceneChange
    act(() =>
      result.current.notifySceneChange([
        makeElement("el1", "rectangle"),
        makeElement("el2", "ellipse"),
        makeLabel("lbl1", "el1"),
        makeArrow("arrow1", "el1", "el2"),
        makeElement("el3", "diamond"),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
      "connecting",
    ]);
    expect(result.current.activeHint).toBe("save");

    // the user's explicit save gesture (menu click / Cmd+S / Excalidraw+
    // export) completes it
    act(() => notifyExplicitSave());
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
      "connecting",
      "save",
    ]);
    // save is the last hint in the chain: nowhere further to go
    expect(result.current.activeHint).toBeNull();

    // a second save must not duplicate the completion
    act(() => notifyExplicitSave());
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
      "connecting",
      "save",
    ]);
  });

  it("an explicit save while some other hint is active does not complete save early", () => {
    const { result } = renderGuideHook(true);
    optInAndShowShapeHint(result);

    act(() => notifyExplicitSave());
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([]);
    expect(result.current.activeHint).toBe("shape-tool");
  });

  it("content that isn't a user mark doesn't complete the hint; a real mark does", () => {
    const { result } = renderGuideHook(true);
    optInAndShowShapeHint(result);

    act(() => result.current.notifySceneChange([])); // baseline
    act(() => result.current.notifySceneChange([makeElement("img", "image")]));
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([]);

    act(() =>
      result.current.notifySceneChange([
        makeElement("img", "image"),
        makeElement("el1", "rectangle"),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);
    expect(result.current.activeHint).toBe("labeling");
  });

  const completeShapeTool = (
    result: { current: ReturnType<typeof useQuickstartGuide> },
    shapeId = "el1",
  ) => {
    optInAndShowShapeHint(result);
    act(() => result.current.notifySceneChange([]));
    act(() =>
      result.current.notifySceneChange([makeElement(shapeId, "rectangle")]),
    );
    expect(result.current.activeHint).toBe("labeling");
  };

  it("a stray unbound arrow does not complete connecting; a two-shape bind does", () => {
    const { result } = renderGuideHook(true);
    completeShapeTool(result);

    const shape1 = makeElement("el1", "rectangle");
    const label = makeElement("t1", "text", {
      containerId: "el1",
      text: "Start",
    });
    act(() => result.current.notifySceneChange([shape1, label]));
    expect(result.current.activeHint).toBe("connecting");

    const stray = makeElement("stray", "arrow", {
      startBinding: null,
      endBinding: null,
    });
    act(() => result.current.notifySceneChange([shape1, label, stray]));
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
    ]);
    expect(result.current.activeHint).toBe("connecting");

    const shape2 = makeElement("el2", "diamond");
    act(() => result.current.notifySceneChange([shape1, label, stray, shape2]));
    expect(result.current.activeHint).toBe("connecting");

    const link = makeElement("link", "arrow", {
      startBinding: { elementId: "el1" },
      endBinding: { elementId: "el2" },
    });
    act(() =>
      result.current.notifySceneChange([shape1, label, stray, shape2, link]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
      "connecting",
    ]);
    expect(result.current.activeHint).toBe("save");
  });

  it("a user who never opted in sees the prompt clear on their first content (PRD P1)", () => {
    const { result } = renderGuideHook(true);
    expect(result.current.isVisible).toBe(true);

    act(() => result.current.notifySceneChange([makeElement("el1", "image")]));
    expect(appJotaiStore.get(guideEndedAtom)).toBe(true);
    expect(result.current.isVisible).toBe(false);
    expect(result.current.activeHint).toBeNull();
  });

  it("ending the guide suppresses all further detection", () => {
    const { result } = renderGuideHook(true);
    optInAndShowShapeHint(result);

    act(() => result.current.endGuide());
    act(() => result.current.notifySceneChange([]));
    act(() =>
      result.current.notifySceneChange([makeElement("el1", "rectangle")]),
    );

    expect(appJotaiStore.get(completedHintsAtom)).toEqual([]);
    expect(result.current.activeHint).toBeNull();
  });
});

describe("Day 15/16 P0 exit check: no side effects for non-participants", () => {
  beforeEach(() => {
    resetGuideState();
    cleanup();
    document.body.innerHTML = "";
  });

  it("a non-new user: scene changes leave all guide state untouched and persist nothing", () => {
    const { result, markGuideSeen } = renderGuideHook(false);

    act(() => result.current.notifySceneChange([]));
    act(() =>
      result.current.notifySceneChange([makeElement("el1", "rectangle")]),
    );
    act(() =>
      result.current.notifySceneChange([
        makeElement("el1", "rectangle"),
        makeElement("el2", "text"),
      ]),
    );

    expect(appJotaiStore.get(guideOptedInAtom)).toBe(false);
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([]);
    expect(appJotaiStore.get(activeHintAtom)).toBeNull();
    expect(appJotaiStore.get(guideEndedAtom)).toBe(false);
    expect(markGuideSeen).not.toHaveBeenCalled();
    expect(result.current.isVisible).toBe(false);
  });

  it("the guide UI mounts no DOM for a user the guide doesn't apply to", () => {
    const { result } = renderGuideHook(false);
    render(
      <QuickstartGuide
        isVisible={result.current.isVisible}
        optedIn={result.current.optedIn}
        activeHint={result.current.activeHint}
        onOptIn={result.current.optIn}
        onEndGuide={result.current.endGuide}
      />,
    );
    act(() =>
      result.current.notifySceneChange([makeElement("el1", "rectangle")]),
    );

    expect(document.querySelector('[data-testid^="quickstart-"]')).toBe(null);
  });
});

describe("quickstart restart from Help", () => {
  beforeEach(() => {
    resetGuideState();
    cleanup();
  });

  it("reopens the first hint after the user ends the guide", () => {
    const { result } = renderGuideHook(true);
    optInAndShowShapeHint(result);
    act(() => result.current.endGuide());
    expect(result.current.isVisible).toBe(false);

    act(() => result.current.restartGuide());
    expect(result.current.isVisible).toBe(true);
    expect(result.current.optedIn).toBe(true);
    expect(result.current.activeHint).toBe("shape-tool");
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([]);
  });

  it("reopens the guide for a returning user who is no longer eligible", () => {
    const { result } = renderGuideHook(false);
    expect(result.current.isVisible).toBe(false);

    act(() => result.current.restartGuide());
    expect(result.current.isVisible).toBe(true);
    expect(result.current.activeHint).toBe("shape-tool");
  });

  it("does not complete hints from canvas content that was already there", () => {
    const { result } = renderGuideHook(false);
    act(() => result.current.restartGuide());

    const existing = [
      makeElement("el1", "rectangle"),
      makeElement("t1", "text", { containerId: "el1", text: "Start" }),
    ];
    act(() => result.current.notifySceneChange(existing));
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([]);
    expect(result.current.activeHint).toBe("shape-tool");

    act(() =>
      result.current.notifySceneChange([
        ...existing,
        makeElement("el2", "diamond"),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);
    expect(result.current.activeHint).toBe("labeling");
  });
});

describe("quickstart actions in the shortcuts-and-help dialog", () => {
  beforeEach(() => {
    resetGuideState();
    cleanup();
    document.body.innerHTML = "";
  });

  it('renders "Show guide" and the moved "Getting started" link, styled like the other help buttons', async () => {
    const onRestart = vi.fn();
    render(
      <Excalidraw>
        <QuickstartHelpButton onRestart={onRestart} />
      </Excalidraw>,
    );
    await waitFor(() => {
      // window.h exists (empty) as soon as the package module loads; the
      // app reference only appears once the editor has mounted
      expect(window.h.app).toBeTruthy();
    });
    act(() => {
      window.h.app.setOpenDialog({ name: "help" });
    });

    const link = await waitFor(() => {
      const el = document.querySelector<HTMLAnchorElement>(
        '[data-testid="quickstart-how-to-start"]',
      );
      if (!el) {
        throw new Error("how-to-start link not in help dialog yet");
      }
      return el;
    });

    // the moved link keeps its new-tab safety and blends in with the
    // dialog's own Documentation / Blog / GitHub / YouTube buttons
    expect(link.href).toBe("https://plus.excalidraw.com/how-to-start");
    // new-tab links without rel="noopener" let the opened page reach back
    // into window.opener -- a real (if minor) security hole
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    expect(link.classList.contains("HelpDialog__btn")).toBe(true);
    expect(link.textContent).toContain("Getting started");

    const restart = document.querySelector<HTMLButtonElement>(
      '[data-testid="quickstart-restart"]',
    )!;
    expect(restart.textContent).toContain("Show guide");
    fireEvent.click(restart);
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});

describe("resuming the guide after a reload", () => {
  beforeEach(() => {
    resetGuideState();
    cleanup();
    localStorage.clear();
  });

  /** A reload: guide atoms start empty again, localStorage doesn't. */
  const remount = (isNewUser: boolean) => {
    cleanup();
    resetGuideAtoms();
    return renderGuideHook(isNewUser);
  };

  const drawFirstShape = (result: {
    current: ReturnType<typeof useQuickstartGuide>;
  }) => {
    act(() => result.current.optIn());
    act(() => result.current.notifySceneChange([]));
    act(() =>
      result.current.notifySceneChange([makeElement("el1", "rectangle")]),
    );
    expect(result.current.activeHint).toBe("labeling");
  };

  it("picks the chain back up where the user left off", () => {
    const { result } = renderGuideHook(true);
    drawFirstShape(result);

    // the reloaded browser is no longer "new" -- it has a drawing now
    const { result: resumed } = remount(false);
    expect(resumed.current.isVisible).toBe(true);
    expect(resumed.current.optedIn).toBe(true);
    expect(resumed.current.activeHint).toBe("labeling");
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);
  });

  it("does not complete the resumed hint from the drawing that's already there", () => {
    const { result } = renderGuideHook(true);
    drawFirstShape(result);

    const { result: resumed } = remount(false);
    const existing = [
      makeElement("el1", "rectangle"),
      makeLabel("lbl1", "el1"),
    ];
    // that label was on the canvas before the reload: it's the baseline,
    // not the user doing the labeling step now
    act(() => resumed.current.notifySceneChange(existing));
    expect(resumed.current.activeHint).toBe("labeling");
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);

    act(() =>
      resumed.current.notifySceneChange([
        ...existing,
        makeElement("el2", "ellipse"),
        makeLabel("lbl2", "el2"),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
    ]);
    expect(resumed.current.activeHint).toBe("connecting");
  });

  it("leaves nothing to resume once the user ends the guide", () => {
    const { result } = renderGuideHook(true);
    drawFirstShape(result);
    act(() => result.current.endGuide());

    const { result: resumed } = remount(false);
    expect(resumed.current.isVisible).toBe(false);
    expect(resumed.current.activeHint).toBeNull();
  });

  it("leaves nothing to resume once the chain is finished", () => {
    const { result } = renderGuideHook(true);
    drawFirstShape(result);
    act(() =>
      result.current.notifySceneChange([
        makeElement("el1", "rectangle"),
        makeLabel("lbl1", "el1"),
      ]),
    );
    act(() =>
      result.current.notifySceneChange([
        makeElement("el1", "rectangle"),
        makeLabel("lbl1", "el1"),
        makeElement("el2", "ellipse"),
        makeArrow("arrow1", "el1", "el2"),
      ]),
    );
    expect(result.current.activeHint).toBe("save");
    act(() => notifyExplicitSave());

    const { result: resumed } = remount(false);
    expect(resumed.current.isVisible).toBe(false);
    expect(resumed.current.activeHint).toBeNull();
  });

  it("stores nothing for a user who never took part (PRD P0)", () => {
    const { result } = renderGuideHook(false);
    act(() => result.current.notifySceneChange([]));
    act(() =>
      result.current.notifySceneChange([makeElement("el1", "rectangle")]),
    );
    expect(localStorage.getItem("excalidraw-quickstart-progress")).toBeNull();

    // nor for a new user who declines the prompt
    const { result: declining } = remount(true);
    act(() => declining.current.endGuide());
    expect(localStorage.getItem("excalidraw-quickstart-progress")).toBeNull();
  });
});

describe("save hint completion from the main menu", () => {
  beforeEach(() => {
    resetGuideState();
    cleanup();
    document.body.innerHTML = "";
  });

  it("a real click on a save menu item completes the save hint", async () => {
    appJotaiStore.set(guideOptedInAtom, true);
    appJotaiStore.set(completedHintsAtom, [
      "shape-tool",
      "labeling",
      "connecting",
    ]);
    appJotaiStore.set(activeHintAtom, "save");

    // <MainMenu>'s children are tunneled into the editor's tree, so this has
    // to go through the real menu: a handler wrapped around <MainMenu> in
    // AppMainMenu would never see the click
    render(
      <Provider store={appJotaiStore}>
        <Excalidraw>
          <AppMainMenu
            onCollabDialogOpen={() => {}}
            isCollaborating={false}
            isCollabEnabled={false}
            theme="light"
            refresh={() => {}}
          />
        </Excalidraw>
      </Provider>,
    );

    const trigger = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(
        '[data-testid="main-menu-trigger"]',
      );
      if (!el) {
        throw new Error("main menu trigger not mounted yet");
      }
      return el;
    });
    fireEvent.click(trigger);

    const saveItem = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(
        '[data-testid="image-export-button"]',
      );
      if (!el) {
        throw new Error("save menu item not open yet");
      }
      return el;
    });
    fireEvent.click(saveItem);

    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
      "connecting",
      "save",
    ]);
    expect(appJotaiStore.get(activeHintAtom)).toBeNull();
  });
});

describe("save hint: menu button, then save button, highlight", () => {
  beforeEach(() => {
    resetGuideState();
    cleanup();
    document.body.innerHTML = "";
  });

  const saveHintStyles = () =>
    document.querySelector('[data-testid="quickstart-hint-save-styles"]')
      ?.textContent ?? "";

  it("pulses the menu button first, switching to the save item once the menu opens", async () => {
    render(
      <Provider store={appJotaiStore}>
        <Excalidraw>
          <AppMainMenu
            onCollabDialogOpen={() => {}}
            isCollaborating={false}
            isCollabEnabled={false}
            theme="light"
            refresh={() => {}}
          />
          <QuickstartGuide
            isVisible={true}
            optedIn={true}
            activeHint="save"
            onOptIn={() => {}}
            onEndGuide={() => {}}
          />
        </Excalidraw>
      </Provider>,
    );

    // stage one: menu closed -- the menu button (top-left hamburger) pulses
    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="quickstart-hint-save"]'),
      ).not.toBe(null);
    });
    expect(saveHintStyles()).toContain("main-menu-trigger");
    expect(saveHintStyles()).not.toContain("save-button");
    expect(document.body).toHaveTextContent("Use the menu to save a copy.");

    // open the real menu (radix mounts the panel)
    const trigger = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(
        '[data-testid="main-menu-trigger"]',
      );
      if (!el) {
        throw new Error("main menu trigger not mounted yet");
      }
      return el;
    });
    fireEvent.click(trigger);

    // stage two: with no file attached to the scene (the guide's audience),
    // "Save to current file" doesn't render -- the Export item is the
    // file-save path, and "Export image..." is highlighted alongside it
    await waitFor(() => {
      expect(saveHintStyles()).toContain('data-testid="json-export-button"');
      expect(saveHintStyles()).toContain('data-testid="image-export-button"');
    });
    expect(saveHintStyles()).not.toContain("main-menu-trigger");
    expect(
      document.querySelector('[data-testid="json-export-button"]'),
    ).not.toBe(null);
    expect(
      document.querySelector('[data-testid="image-export-button"]'),
    ).not.toBe(null);
    expect(document.body).toHaveTextContent(
      "Now use a highlighted option to save a copy",
    );

    // ...and when a file IS attached, "Save to current file" replaces the
    // Export item as the file-save target; "Export image..." stays
    const saveItem = document.createElement("button");
    saveItem.setAttribute("data-testid", "save-button");
    document.querySelector(".excalidraw .main-menu")!.append(saveItem);
    await waitFor(() => {
      expect(saveHintStyles()).toContain('data-testid="save-button"');
      expect(saveHintStyles()).toContain('data-testid="image-export-button"');
      expect(saveHintStyles()).not.toContain("json-export-button");
    });
  });
});
