import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { appJotaiStore, Provider } from "../app-jotai";
import {
  findConnectingArrowIds,
  findFirstUserMark,
  findLabeledContainerIds,
  nextHint,
} from "../quickstart/behavior";
import { QuickstartGuide } from "../quickstart/QuickstartGuide";
import {
  activeHintAtom,
  completedHintsAtom,
  guideEndedAtom,
  guideForcedVisibleAtom,
  guideOptedInAtom,
} from "../quickstart/state";
import { useQuickstartGuide } from "../quickstart/useQuickstartGuide";

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

const resetGuideState = () => {
  appJotaiStore.set(guideOptedInAtom, false);
  appJotaiStore.set(activeHintAtom, null);
  appJotaiStore.set(completedHintsAtom, []);
  appJotaiStore.set(guideEndedAtom, false);
  appJotaiStore.set(guideForcedVisibleAtom, false);
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
    expect(nextHint(["shape-tool", "labeling", "connecting"])).toBeNull();
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

  it("findLabeledContainerIds requires bound, non-empty text on a shape", () => {
    const shape = makeElement("shape", "rectangle");
    expect(
      findLabeledContainerIds([
        shape,
        makeElement("empty", "text", { containerId: "shape", text: "" }),
      ]).size,
    ).toBe(0);
    expect(
      findLabeledContainerIds([
        shape,
        makeElement("label", "text", { containerId: "shape", text: "Start" }),
      ]).has("shape"),
    ).toBe(true);
    expect(
      findLabeledContainerIds([
        makeElement("label", "text", { containerId: null, text: "loose" }),
      ]).size,
    ).toBe(0);
  });

  it("findConnectingArrowIds requires both ends bound to two different elements", () => {
    const a = makeElement("a", "rectangle");
    const b = makeElement("b", "diamond");
    const stray = makeElement("stray", "arrow", {
      startBinding: null,
      endBinding: null,
    });
    const oneSided = makeElement("one", "arrow", {
      startBinding: { elementId: "a" },
      endBinding: null,
    });
    const loop = makeElement("loop", "arrow", {
      startBinding: { elementId: "a" },
      endBinding: { elementId: "a" },
    });
    const connected = makeElement("link", "arrow", {
      startBinding: { elementId: "a" },
      endBinding: { elementId: "b" },
    });

    expect(findConnectingArrowIds([a, b, stray]).size).toBe(0);
    expect(findConnectingArrowIds([a, b, oneSided]).size).toBe(0);
    expect(findConnectingArrowIds([a, b, loop]).size).toBe(0);
    expect(findConnectingArrowIds([a, b, connected]).has("link")).toBe(true);
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

  it("the labeling hint tells the user to press Enter and has an end control", () => {
    const { onEndGuide } = renderUi({
      optedIn: true,
      activeHint: "labeling",
    });
    expect(document.body).toHaveTextContent("press Enter to add a label");
    fireEvent.click(
      document.querySelector('[data-testid="quickstart-end-guide"]')!,
    );
    expect(onEndGuide).toHaveBeenCalledTimes(1);
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

  it("the user authoring a shape completes the hint on its own, once", () => {
    const { result } = renderGuideHook(true);
    optInAndShowShapeHint(result);

    act(() => result.current.notifySceneChange([])); // baseline
    act(() =>
      result.current.notifySceneChange([makeElement("el1", "rectangle")]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);
    expect(result.current.activeHint).toBe("labeling");

    // a second shape must not resurrect or skip labeling
    act(() =>
      result.current.notifySceneChange([
        makeElement("el1", "rectangle"),
        makeElement("el2", "ellipse"),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);
    expect(result.current.activeHint).toBe("labeling");
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

  it("labeling completes only after bound text has content and editing ends", () => {
    const { result } = renderGuideHook(true);
    completeShapeTool(result);

    const shape = makeElement("el1", "rectangle");
    act(() =>
      result.current.notifySceneChange(
        [shape, makeElement("t1", "text", { containerId: "el1", text: "" })],
        { isEditingText: true },
      ),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);

    act(() =>
      result.current.notifySceneChange(
        [
          shape,
          makeElement("t1", "text", { containerId: "el1", text: "Start" }),
        ],
        { isEditingText: true },
      ),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);
    expect(result.current.activeHint).toBe("labeling");

    act(() =>
      result.current.notifySceneChange(
        [
          shape,
          makeElement("t1", "text", { containerId: "el1", text: "Start" }),
        ],
        { isEditingText: false },
      ),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([
      "shape-tool",
      "labeling",
    ]);
    expect(result.current.activeHint).toBe("connecting");
  });

  it("a stray unbound arrow does not complete connecting; a two-shape bind does", () => {
    const { result } = renderGuideHook(true);
    completeShapeTool(result);

    const shape1 = makeElement("el1", "rectangle");
    const label = makeElement("t1", "text", {
      containerId: "el1",
      text: "Start",
    });
    act(() =>
      result.current.notifySceneChange([shape1, label], { isEditingText: false }),
    );
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
    act(() =>
      result.current.notifySceneChange([shape1, label, stray, shape2]),
    );
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
    expect(result.current.activeHint).toBeNull();
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
