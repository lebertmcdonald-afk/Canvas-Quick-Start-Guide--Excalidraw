import { render, cleanup, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { Provider, appJotaiStore } from "../app-jotai";
import QuickstartGuide from "../quickstart/QuickstartGuide";
import { findFirstUserMark, nextHint } from "../quickstart/behavior";
import { trackQuickstartElements } from "../quickstart/quickstartTracker";
import {
  activeHintAtom,
  completedHintsAtom,
  guideEndedAtom,
  guideOptedInAtom,
} from "../quickstart/state";

const renderGuide = (isNewUser: boolean | null) => {
  const onEndGuide = vi.fn();
  render(
    <Provider store={appJotaiStore}>
      <QuickstartGuide isNewUser={isNewUser} onEndGuide={onEndGuide} />
    </Provider>,
  );
  return onEndGuide;
};

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

const optInWithShapeHint = () => {
  appJotaiStore.set(guideOptedInAtom, true);
  appJotaiStore.set(activeHintAtom, "shape-tool");
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
    resetGuideState();
    cleanup();
    document.body.innerHTML = "";
  });

  it("renders nothing for a non-new user or while eligibility is pending", () => {
    const onEnd = renderGuide(true);
    expect(document.body).toHaveTextContent("Making your first diagram?");
    expect(onEnd).not.toHaveBeenCalled();
    cleanup();

    renderGuide(false);
    expect(document.querySelector('[data-testid="quickstart-prompt"]')).toBe(
      null,
    );
    cleanup();

    renderGuide(null);
    expect(document.querySelector('[data-testid="quickstart-prompt"]')).toBe(
      null,
    );
  });

  it("opting in swaps the prompt for the shape-tool hint and its highlight", () => {
    renderGuide(true);

    // before opt-in: prompt visible, no highlight stylesheet
    expect(
      document.querySelector('[data-testid="quickstart-hint-shape-tool"]'),
    ).toBe(null);
    expect(
      document.querySelector('[data-testid="quickstart-shape-tool-styles"]'),
    ).toBe(null);

    fireEvent.click(
      document.querySelector('[data-testid="quickstart-opt-in"]')!,
    );

    expect(document.querySelector('[data-testid="quickstart-prompt"]')).toBe(
      null,
    );
    expect(
      document.querySelector('[data-testid="quickstart-hint-shape-tool"]'),
    ).not.toBe(null);
    expect(document.body).toHaveTextContent("Draw your first shape");
    expect(
      document.querySelector('[data-testid="quickstart-shape-tool-styles"]'),
    ).not.toBe(null);
  });

  it("the end-guide control on the hint ends the guide and reports it", () => {
    const onEnd = renderGuide(true);
    fireEvent.click(
      document.querySelector('[data-testid="quickstart-opt-in"]')!,
    );
    fireEvent.click(
      document.querySelector('[data-testid="quickstart-end-guide"]')!,
    );

    expect(document.querySelector('[data-testid="quickstart-prompt"]')).toBe(
      null,
    );
    expect(
      document.querySelector('[data-testid="quickstart-hint-shape-tool"]'),
    ).toBe(null);
    expect(
      document.querySelector('[data-testid="quickstart-shape-tool-styles"]'),
    ).toBe(null);
    expect(appJotaiStore.get(guideEndedAtom)).toBe(true);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("declining the prompt ends the guide too", () => {
    const onEnd = renderGuide(true);
    fireEvent.click(
      document.querySelector('[data-testid="quickstart-decline"]')!,
    );

    expect(appJotaiStore.get(guideEndedAtom)).toBe(true);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="quickstart-prompt"]')).toBe(
      null,
    );
  });
});

describe("quickstart shape detection (Day 16 mainline)", () => {
  beforeEach(() => {
    resetGuideState();
    optInWithShapeHint();
  });

  it("the user creating a shape completes the hint on its own, once", () => {
    trackQuickstartElements([]); // baseline on first change after opt-in

    trackQuickstartElements([makeElement("el1", "rectangle")]);
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);
    expect(appJotaiStore.get(activeHintAtom)).toBeNull();

    // a second shape must not resurrect or duplicate anything
    trackQuickstartElements([
      makeElement("el1", "rectangle"),
      makeElement("el2", "ellipse"),
    ]);
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);
    expect(appJotaiStore.get(activeHintAtom)).toBeNull();
  });

  it("content that predates opting in and isn't a user mark is baseline, not a completion", () => {
    resetGuideState();
    // user ignored the prompt and an image landed on canvas, then opted in
    trackQuickstartElements([makeElement("old", "image")]);
    optInWithShapeHint();

    // the import still being there completes nothing...
    trackQuickstartElements([makeElement("old", "image")]);
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([]);

    // ...but a genuinely new user mark does
    trackQuickstartElements([
      makeElement("old", "image"),
      makeElement("new", "rectangle"),
    ]);
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);
  });

  it("an already-drawn canvas satisfies the hint outright at opt-in", () => {
    resetGuideState();
    trackQuickstartElements([makeElement("old", "rectangle")]);
    optInWithShapeHint();

    // first change after activation sees the finished mark and completes
    trackQuickstartElements([makeElement("old", "rectangle")]);
    expect(appJotaiStore.get(completedHintsAtom)).toEqual(["shape-tool"]);
  });
});

describe("Day 15/16 P0 exit check: no side effects for non-participants", () => {
  beforeEach(() => {
    resetGuideState();
    cleanup();
    document.body.innerHTML = "";
  });

  it("a user who never opted in: onChange tracking leaves all guide state untouched", () => {
    trackQuickstartElements([]);
    trackQuickstartElements([makeElement("el1", "rectangle")]);
    trackQuickstartElements([
      makeElement("el1", "rectangle"),
      makeElement("el2", "text"),
    ]);

    expect(appJotaiStore.get(guideOptedInAtom)).toBe(false);
    expect(appJotaiStore.get(completedHintsAtom)).toEqual([]);
    expect(appJotaiStore.get(activeHintAtom)).toBeNull();
    expect(appJotaiStore.get(guideEndedAtom)).toBe(false);
  });

  it("after ending the guide, further changes complete nothing", () => {
    optInWithShapeHint();
    appJotaiStore.set(guideEndedAtom, true);

    trackQuickstartElements([]);
    trackQuickstartElements([makeElement("el1", "rectangle")]);

    expect(appJotaiStore.get(completedHintsAtom)).toEqual([]);
  });

  it("the guide UI mounts no DOM and no stylesheet for a non-new user", () => {
    renderGuide(false);
    trackQuickstartElements([makeElement("el1", "rectangle")]);

    expect(document.querySelector('[data-testid^="quickstart-"]')).toBe(null);
  });
});
