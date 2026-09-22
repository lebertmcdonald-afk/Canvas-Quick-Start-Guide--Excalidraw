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
  findFirstUserConnection,
  findFirstUserLabel,
  findFirstUserMark,
  nextHint,
} from "../quickstart/behavior";
import { QuickstartGuide } from "../quickstart/QuickstartGuide";
import {
  activeHintAtom,
  completedHintsAtom,
  guideEndedAtom,
  guideOptedInAtom,
} from "../quickstart/state";

import { useQuickstartGuide } from "../quickstart/useQuickstartGuide";

import type { HintId } from "../quickstart/types";

import type { ReactNode } from "react";

const makeElement = (
  id: string,
  type: OrderedExcalidrawElement["type"],
  isDeleted = false,
) => ({ id, type, isDeleted } as unknown as OrderedExcalidrawElement);

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

const resetGuideState = () => {
  appJotaiStore.set(guideOptedInAtom, false);
  appJotaiStore.set(activeHintAtom, null);
  appJotaiStore.set(completedHintsAtom, []);
  appJotaiStore.set(guideEndedAtom, false);
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
      findFirstUserMark(known, [makeElement("b", "rectangle", true)]),
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

  it('the prompt\'s "How to start" link opens the right page in a new tab', () => {
    renderUi({ optedIn: false });
    const link = document.querySelector<HTMLAnchorElement>(
      '[data-testid="quickstart-how-to-start"]',
    )!;
    expect(link.href).toBe("https://plus.excalidraw.com/how-to-start");
    expect(link.target).toBe("_blank");
    // new-tab links without rel="noopener" let the opened page reach back
    // into window.opener -- a real (if minor) security hole
    expect(link.rel).toContain("noopener");
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

  it("the shape-tool hint shows the toolbar highlight and an explicit end control", () => {
    const { onEndGuide } = renderUi({
      optedIn: true,
      activeHint: "shape-tool",
    });
    expect(document.body).toHaveTextContent("draw your first shape");
    expect(
      document.querySelector('[data-testid="quickstart-shape-tool-styles"]'),
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
      document.querySelector('[data-testid="quickstart-shape-tool-styles"]'),
    ).toBe(null);
    expect(document.querySelector('[data-testid^="quickstart-"]')).toBe(null);
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
    // save isn't implemented yet, so the chain has nowhere further to go
    expect(result.current.activeHint).toBeNull();

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
