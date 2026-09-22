import { useEffect, useRef } from "react";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { useAtom } from "../app-jotai";

import { HINT_COMPLETION, nextHint } from "./behavior";
import {
  activeHintAtom,
  completedHintsAtom,
  guideEndedAtom,
  guideForcedVisibleAtom,
  guideOptedInAtom,
} from "./state";

import type { HintId } from "./types";

/**
 * Day 16 (shape-tool) + Day 18 (labeling/connecting): drives the guide
 * state atoms scaffolded on Day 15.
 *
 * isNewUser gates whether the guide can appear at all (Day 15's job, still
 * the source of truth); everything below decides what to do once it can.
 * restartGuide can force the guide back on after dismiss or for a
 * returning browser that Help asked to see it again.
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
  const [forcedVisible, setForcedVisible] = useAtom(guideForcedVisibleAtom);
  const [activeHint, setActiveHint] = useAtom(activeHintAtom);
  const [completedHints, setCompletedHints] = useAtom(completedHintsAtom);

  // Element ids on the canvas when scene detection last looked, while the
  // guide is active. Null whenever it isn't, so users the guide doesn't
  // apply to never pay for any of this.
  const knownElementIdsRef = useRef<ReadonlySet<string> | null>(null);
  // After a Help-menu restart, existing canvas content is baselined and
  // must not instantly complete hints or dismiss the prompt (P1).
  const skipBaselineCompletionRef = useRef(false);

  const guideApplies = (isNewUser === true || forcedVisible) && !ended;
  const isVisible = guideApplies;

  useEffect(() => {
    if (isNewUser === true) {
      markGuideSeen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewUser]);

  // Once opted in, the next implemented, uncompleted hint goes active
  // until finished. Adding a hint to IMPLEMENTED_HINTS advances the chain
  // automatically once the previous hint completes.
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
    skipBaselineCompletionRef.current = false;
  };

  /**
   * Re-show the guide from Help after the user dismissed it. Starts at the
   * first hint (already opted in) so an existing drawing doesn't trip the
   * "clear the prompt on first content" rule.
   */
  const restartGuide = () => {
    setForcedVisible(true);
    setEnded(false);
    setOptedIn(true);
    setCompletedHints([]);
    setActiveHint(nextHint([]));
    knownElementIdsRef.current = null;
    skipBaselineCompletionRef.current = true;
  };

  const completeHint = (hintId: HintId) => {
    if (!completedHints.includes(hintId)) {
      const nextCompleted = [...completedHints, hintId];
      setCompletedHints(nextCompleted);
      setActiveHint(nextHint(nextCompleted));
    }
  };

  /**
   * Called on every scene change, wired into the existing onChange handler,
   * so it only observes drawing after Excalidraw has applied it -- it can't
   * introduce delay or gate the canvas. Jobs:
   *  - users the guide doesn't apply to (or who ended it): clear the
   *    baseline and get out immediately (the P0 exit check).
   *  - if the user never opted in and just starts drawing on their own,
   *    the prompt gets out of the way on that first interaction (PRD P1).
   *  - if the active hint is one the user just satisfied, it completes and
   *    disappears on its own, never repeating. What counts as satisfying it
   *    is per-hint (HINT_COMPLETION in behavior.ts).
   */
  const notifySceneChange = (
    elements: readonly OrderedExcalidrawElement[],
  ) => {
    if (!guideApplies) {
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
      if (skipBaselineCompletionRef.current) {
        skipBaselineCompletionRef.current = false;
        return;
      }
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
    restartGuide,
    notifySceneChange,
  };
};
