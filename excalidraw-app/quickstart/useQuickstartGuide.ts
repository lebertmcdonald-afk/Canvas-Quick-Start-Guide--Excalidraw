import { useEffect, useRef } from "react";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { appJotaiStore, useAtom } from "../app-jotai";

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
 * Day 16 (shape-tool) + Day 18 (labeling, connecting, save, Help-menu
 * restart): drives the guide state atoms scaffolded on Day 15.
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
  // setCompletedHints is used directly only by restartGuide (a plain
  // React-state reset, called from inside this hook's own component
  // tree); hint completion itself always goes through
  // completeHintImperatively (appJotaiStore.set) instead, since that
  // path also has to work from notifyExplicitSave, called from outside
  // any component that has this hook mounted.
  const [completedHints, setCompletedHints] = useAtom(completedHintsAtom);

  // For the currently active hint, the ids of elements that satisfied its
  // completion predicate (behavior.ts's HINT_COMPLETION) the last time
  // this ran. Reset whenever the active hint itself changes -- a new
  // hint's predicate is different, so its baseline has to be recaptured
  // fresh, not carried over from the previous hint.
  const satisfiedBaselineRef = useRef<{
    hint: HintId | null;
    ids: ReadonlySet<string>;
  } | null>(null);
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
    satisfiedBaselineRef.current = null;
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
    satisfiedBaselineRef.current = null;
    skipBaselineCompletionRef.current = true;
  };

  const completeHint = completeHintImperatively;

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
   *    is per-hint (HINT_COMPLETION in behavior.ts); *which* elements newly
   *    satisfy it is tracked here by diffing ids-that-satisfy-it against
   *    the previous check, not by whether the id itself is new -- an arrow
   *    can exist, unbound, for one check and become bound on a later one
   *    with the same id (see the comment on HINT_COMPLETION).
   */
  const notifySceneChange = (elements: readonly OrderedExcalidrawElement[]) => {
    if (!guideApplies) {
      satisfiedBaselineRef.current = null;
      return;
    }

    if (!optedIn) {
      if (elements.length > 0) {
        endGuide();
      }
      return;
    }

    const isMatch = activeHint ? HINT_COMPLETION[activeHint] : undefined;
    const hintPending =
      isMatch !== undefined &&
      activeHint !== null &&
      !completedHints.includes(activeHint);

    if (!hintPending) {
      satisfiedBaselineRef.current = null;
      return;
    }

    const currentlySatisfyingIds = new Set(
      elements
        .filter((element) => isMatch(element))
        .map((element) => element.id),
    );

    if (
      satisfiedBaselineRef.current === null ||
      satisfiedBaselineRef.current.hint !== activeHint
    ) {
      // First change since this hint became active: anything already
      // satisfying it predates our watching for *this* hint specifically,
      // so it's the starting baseline -- unless something already
      // satisfies it, which completes the hint outright (no point
      // teaching a finished step). Skipped right after a Help restart, so
      // pre-existing content can't instantly complete the reopened guide.
      const shouldSkip = skipBaselineCompletionRef.current;
      skipBaselineCompletionRef.current = false;
      satisfiedBaselineRef.current = {
        hint: activeHint,
        ids: currentlySatisfyingIds,
      };
      if (!shouldSkip && currentlySatisfyingIds.size > 0) {
        completeHint(activeHint as HintId);
      }
      return;
    }

    const newlySatisfied = [...currentlySatisfyingIds].some(
      (id) => !satisfiedBaselineRef.current!.ids.has(id),
    );
    satisfiedBaselineRef.current = {
      hint: activeHint,
      ids: currentlySatisfyingIds,
    };
    if (newlySatisfied) {
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
