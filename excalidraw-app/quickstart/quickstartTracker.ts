import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { appJotaiStore } from "../app-jotai";

import { findFirstUserMark, hasUserMark, nextHint } from "./behavior";
import {
  activeHintAtom,
  completedHintsAtom,
  guideEndedAtom,
  guideOptedInAtom,
} from "./state";

import type { HintId } from "./types";

/**
 * Element ids on the canvas last time the tracker looked, while the guide is
 * active. Null whenever the guide is inactive (not opted in, or ended), so a
 * user who never touches the prompt never pays for any of this.
 */
let knownElementIds: ReadonlySet<string> | null = null;

const completeHint = (hintId: HintId) => {
  const completed = appJotaiStore.get(completedHintsAtom);
  if (completed.includes(hintId)) {
    return;
  }
  const nextCompleted = [...completed, hintId];
  appJotaiStore.set(completedHintsAtom, nextCompleted);
  appJotaiStore.set(activeHintAtom, nextHint(nextCompleted));
};

const isShapeHintPending = () =>
  appJotaiStore.get(activeHintAtom) === "shape-tool" &&
  !appJotaiStore.get(completedHintsAtom).includes("shape-tool");

/**
 * Called from App.tsx's onChange. Completes the shape-tool hint the moment
 * the user authors a shape themselves, so it disappears on its own and never
 * repeats.
 *
 * The whole body is skipped via two atom reads for anyone who never opted in
 * (or ended the guide) -- the Day 15/16 P0 requires zero delay or side
 * effect for a user who ignores the prompt entirely.
 */
export const trackQuickstartElements = (
  elements: readonly OrderedExcalidrawElement[],
) => {
  if (
    !appJotaiStore.get(guideOptedInAtom) ||
    appJotaiStore.get(guideEndedAtom)
  ) {
    knownElementIds = null;
    return;
  }

  const shapeHintPending = isShapeHintPending();

  if (knownElementIds === null) {
    // First change since the guide activated: what's already on the canvas
    // predates opting in, so it baselines instead of counting as new --
    // unless it already includes an authored mark, which satisfies the
    // shape-tool hint outright (no point teaching a finished step).
    knownElementIds = new Set(elements.map((element) => element.id));
    if (shapeHintPending && hasUserMark(elements)) {
      completeHint("shape-tool");
    }
    return;
  }

  const createdMark = findFirstUserMark(knownElementIds, elements);
  knownElementIds = new Set(elements.map((element) => element.id));
  if (shapeHintPending && createdMark) {
    completeHint("shape-tool");
  }
};
