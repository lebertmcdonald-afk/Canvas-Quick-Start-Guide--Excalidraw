import { useEffect, useRef } from "react";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { appJotaiStore, useAtom } from "../app-jotai";

import { HINT_COMPLETION, nextHint } from "./behavior";
import {
  activeHintAtom,
  completedHintsAtom,
  guideEndedAtom,
  guideOptedInAtom,
} from "./state";

import type { HintId } from "./types";

/**
 * Marks a hint completed and advances to the next one -- imperative, via
 * appJotaiStore directly, so it's usable both from inside the hook (where
 * the atoms are already live via useAtom) and from notifyExplicitSave
 * below, called from outside any component that has this hook mounted.
 */
const completeHintImperatively = (hintId: HintId) => {
  const completedHints = appJotaiStore.get(completedHintsAtom);
  if (completedHints.includes(hintId)) {
    return;
  }
  const nextCompleted = [...completedHints, hintId];
  appJotaiStore.set(completedHintsAtom, nextCompleted);
  appJotaiStore.set(activeHintAtom, nextHint(nextCompleted));
};

/**
 * Completes the save hint -- called directly from the user's explicit save
 * gestures (AppMainMenu's save/export items, the Cmd+S / Cmd+Shift+E
 * shortcuts, Excalidraw+ export success; see their markExplicitlySaved()
 * call sites in unsavedWork.ts), none of which are scene changes, so
 * notifySceneChange's onChange-driven detection can't see them. A plain
 * exported function rather than something returned from the hook, since
 * those call sites live in components (AppMainMenu) that don't otherwise
 * have this hook's return value in scope.
 */
export const notifyExplicitSave = () => {
  if (appJotaiStore.get(activeHintAtom) === "save") {
    completeHintImperatively("save");
  }
};

/**
 * Day 16 (shape-tool) + Day 18 (labeling, connecting, save): drives the
 * guide state atoms scaffolded on Day 15.
 *
 * isNewUser gates whether the guide can appear at all (Day 15's job, still
 * the source of truth); everything below decides what to do once it can.
 *
 * markGuideSeen persists "this browser has seen the guide" for *future*
 * sessions -- called once, on exposure, not on completion. It must not
 * affect isNewUser, since that would hide the guide from the very session
 * it just appeared in (see the comment on markGuideSeen itself).
 */
export const useQuickstartGuide = (
  isNewUser: boolean | null,
  markGuideSeen: () => void,
) => {
  const [optedIn, setOptedIn] = useAtom(guideOptedInAtom);
  const [ended, setEnded] = useAtom(guideEndedAtom);
  const [activeHint, setActiveHint] = useAtom(activeHintAtom);
  // Written only via completeHintImperatively (appJotaiStore.set), which
  // both notifySceneChange below and notifyExplicitSave (outside this
  // hook) go through -- so only the reactive value is needed here.
  const [completedHints] = useAtom(completedHintsAtom);

  // Element ids on the canvas when scene detection last looked, while the
  // guide is active. Null whenever it isn't, so users the guide doesn't
  // apply to never pay for any of this.
  const knownElementIdsRef = useRef<ReadonlySet<string> | null>(null);

  const isVisible = isNewUser === true && !ended;

  useEffect(() => {
    if (isNewUser === true) {
      markGuideSeen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewUser]);

  // Once opted in, the next implemented, uncompleted hint goes active
  // until finished. Day 16 only builds the first hint's content; later
  // days add theirs to behavior.ts's IMPLEMENTED_HINTS and the chain
  // starts advancing through them automatically.
  useEffect(() => {
    if (!activeHint && optedIn && !ended) {
      const next = nextHint(completedHints);
      if (next) {
        setActiveHint(next);
      }
    }
  }, [optedIn, ended, completedHints, activeHint, setActiveHint]);

  const optIn = () => setOptedIn(true);

  /** The explicit, visible "end the guide" control -- PRD P0. */
  const endGuide = () => {
    setEnded(true);
    setActiveHint(null);
    knownElementIdsRef.current = null;
  };

  const completeHint = completeHintImperatively;

  /**
   * Called on every scene change, wired into the existing onChange handler,
   * so it only observes drawing after Excalidraw has applied it -- it can't
   * introduce delay or gate the canvas. Three jobs:
   *  - users the guide doesn't apply to (or who ended it): clear the
   *    baseline and get out immediately (the P0 exit check both days
   *    protect).
   *  - if the user never opted in and just starts drawing on their own,
   *    the prompt gets out of the way on that first interaction (PRD P1).
   *  - if the active hint is one the user just satisfied, it completes and
   *    disappears on its own, never repeating. What counts as satisfying it
   *    is per-hint (HINT_COMPLETION in behavior.ts) -- shape-tool wants any
   *    authored mark, labeling specifically wants a bound text label -- so
   *    imports and other non-authored content don't count for either (PRD
   *    §3), and one hint's detection can't accidentally complete another.
   */
  const notifySceneChange = (elements: readonly OrderedExcalidrawElement[]) => {
    if (!isNewUser || ended) {
      knownElementIdsRef.current = null;
      return;
    }

    if (!optedIn) {
      if (elements.length > 0) {
        endGuide();
      }
      return;
    }

    const completion = activeHint ? HINT_COMPLETION[activeHint] : undefined;
    const hintPending =
      completion !== undefined &&
      activeHint !== null &&
      !completedHints.includes(activeHint);

    if (knownElementIdsRef.current === null) {
      // First change since detection started: what's already on the canvas
      // predates the guide, so it baselines instead of counting as new --
      // unless it already satisfies the active hint outright (no point
      // teaching a finished step).
      knownElementIdsRef.current = new Set(
        elements.map((element) => element.id),
      );
      if (hintPending && completion.hasAny(elements)) {
        completeHint(activeHint as HintId);
      }
      return;
    }

    const createdMatch = hintPending
      ? completion.findFirstNew(knownElementIdsRef.current, elements)
      : null;
    knownElementIdsRef.current = new Set(elements.map((element) => element.id));
    if (hintPending && createdMatch) {
      completeHint(activeHint as HintId);
    }
  };

  return {
    isVisible,
    optedIn,
    activeHint,
    optIn,
    endGuide,
    notifySceneChange,
  };
};
