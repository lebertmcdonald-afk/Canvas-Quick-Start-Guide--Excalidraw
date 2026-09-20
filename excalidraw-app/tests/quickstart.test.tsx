import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { appJotaiStore, Provider } from "../app-jotai";
import { findFirstUserMark, nextHint } from "../quickstart/behavior";
import { QuickstartGuide } from "../quickstart/QuickstartGuide";
import {
  activeHintAtom,
  completedHintsAtom,
  guideEndedAtom,
  guideOptedInAtom,
} from "../quickstart/state";
import { useQuickstartGuide } from "../quickstart/useQuickstartGuide";

import type { ReactNode } from "react";

const makeElement = (
  id: string,
  type: OrderedExcalidrawElement["type"],
  isDeleted = false,
) => ({ id, type, isDeleted } as unknown as OrderedExcalidrawElement);

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
    expect(nextHint(["shape-tool"])).toBeNull();
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
});

describe("quickstart guide UI", () => {
  beforeEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  const renderUi = (props: {
    isVisible?: boolean;
    optedIn?: boolean;
    activeHint?: "shape-tool" | null;
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
      document.querySelector('[data-testid="quickstart-shape-tool-styles"]'),
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
    expect(result.current.activeHint).toBeNull();

    // a second shape must not resurrect or duplicate anything
    act(() =>
      result.current.notifySceneChange([
        makeElement("el1", "rectangle"),
        makeElement("el2", "ellipse"),
      ]),
    );
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);
    expect(result.current.activeHint).toBeNull();
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
