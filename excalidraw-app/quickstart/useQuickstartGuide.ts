import { useEffect, useRef } from "react";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { useAtom } from "../app-jotai";

import {
  hasExplicitlySavedCurrentScene,
  subscribeExplicitSave,
} from "../unsavedWork";

import { HINT_COMPLETION, nextHint } from "./behavior";
import {
  activeHintAtom,
  completedHintsAtom,
  guideEndedAtom,
  guideForcedVisibleAtom,
  guideOptedInAtom,
} from "./state";

import type { HintId } from "./types";

export type SceneChangeMeta = {
  /** True when this scene write came from a collaborator, not the local user. */
  isRemote?: boolean;
};

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
  // Ids that already satisfy the *current* hint. Re-seeded from the last
  // seen scene when the hint changes, so existing content doesn't finish
  // the new hint, but an arrow created unbound and then bound still does.
  const satisfiedIdsRef = useRef<ReadonlySet<string>>(new Set());
  const lastElementsRef = useRef<readonly OrderedExcalidrawElement[]>([]);
  const activeHintRef = useRef(activeHint);
  const completedHintsRef = useRef(completedHints);
  const optedInRef = useRef(optedIn);
  const guideAppliesRef = useRef(false);
  activeHintRef.current = activeHint;
  completedHintsRef.current = completedHints;
  optedInRef.current = optedIn;

  const guideApplies = (isNewUser === true || forcedVisible) && !ended;
  guideAppliesRef.current = guideApplies;
  const isVisible = guideApplies;

  const matchingIdsFor = (
    hint: HintId | null,
    elements: readonly OrderedExcalidrawElement[],
  ) => {
    const completion = hint ? HINT_COMPLETION[hint] : undefined;
    if (!completion) {
      return new Set<string>();
    }
    return new Set(
      elements
        .filter((element) => completion.isSatisfied(element, elements))
        .map((element) => element.id),
    );
  };

  const seedSatisfiedIds = (hint: HintId | null) => {
    satisfiedIdsRef.current = matchingIdsFor(hint, lastElementsRef.current);
  };

  const completeHint = (hintId: HintId) => {
    if (completedHintsRef.current.includes(hintId)) {
      return;
    }
    const nextCompleted = [...completedHintsRef.current, hintId];
    const next = nextHint(nextCompleted);
    // Update refs first so a follow-up onChange in this same tick (Excalidraw
    // often fires more than one) sees the new hint, not a stale closure.
    completedHintsRef.current = nextCompleted;
    activeHintRef.current = next;
    seedSatisfiedIds(next);
    setCompletedHints(nextCompleted);
    setActiveHint(next);
  };

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
        seedSatisfiedIds(next);
        activeHintRef.current = next;
        setActiveHint(next);
      }
    }
    // seedSatisfiedIds reads refs only; listing it would retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optedIn, ended, completedHints, activeHint, setActiveHint]);

  useEffect(() => {
    // Save isn't a scene-element check: if the user already explicitly
    // saved this drawing, don't teach a finished step. Do not reseed
    // satisfiedIds here — lastElements may already include a connection
    // that arrived before React painted the new hint, and reseeding would
    // mark it as already done so the hint never completes.
    if (activeHint === "save" && hasExplicitlySavedCurrentScene()) {
      completeHint("save");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHint]);

  useEffect(() => {
    return subscribeExplicitSave(() => {
      if (activeHintRef.current === "save") {
        completeHint("save");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const optIn = () => setOptedIn(true);

  /** The explicit, visible "end the guide" control -- PRD P0. */
  const endGuide = () => {
    setEnded(true);
    setActiveHint(null);
    activeHintRef.current = null;
    knownElementIdsRef.current = null;
    skipBaselineCompletionRef.current = false;
    satisfiedIdsRef.current = new Set();
    lastElementsRef.current = [];
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
    const firstHint = nextHint([]);
    completedHintsRef.current = [];
    activeHintRef.current = firstHint;
    optedInRef.current = true;
    setActiveHint(firstHint);
    knownElementIdsRef.current = null;
    skipBaselineCompletionRef.current = true;
    satisfiedIdsRef.current = new Set();
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
    meta?: SceneChangeMeta,
  ) => {
    lastElementsRef.current = elements;
    const isRemote = meta?.isRemote === true;

    if (!guideAppliesRef.current) {
      knownElementIdsRef.current = null;
      return;
    }

    if (!optedInRef.current) {
      // A collaborator's edit must not dismiss the prompt (P1 is the
      // *local* user starting to draw on their own).
      if (elements.length > 0 && !isRemote) {
        endGuide();
      }
      if (isRemote) {
        knownElementIdsRef.current = new Set(
          elements.map((element) => element.id),
        );
      }
      return;
    }

    const currentHint = activeHintRef.current;
    if (currentHint && completedHintsRef.current.includes(currentHint)) {
      const next = nextHint(completedHintsRef.current);
      if (next !== currentHint) {
        activeHintRef.current = next;
        seedSatisfiedIds(next);
        setActiveHint(next);
      }
      return;
    }
    const completion = currentHint ? HINT_COMPLETION[currentHint] : undefined;
    const hintPending =
      completion !== undefined &&
      currentHint !== null &&
      !completedHintsRef.current.includes(currentHint);
    const matchingIds = matchingIdsFor(currentHint, elements);

    if (isRemote) {
      knownElementIdsRef.current = new Set(
        elements.map((element) => element.id),
      );
      satisfiedIdsRef.current = new Set([
        ...satisfiedIdsRef.current,
        ...matchingIds,
      ]);
      return;
    }

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
        satisfiedIdsRef.current = matchingIds;
        return;
      }
      satisfiedIdsRef.current = matchingIds;
      if (hintPending && completion.hasAny(elements)) {
        completeHint(currentHint as HintId);
      }
      return;
    }

    const previouslySatisfied = satisfiedIdsRef.current;
    const newlySatisfied = [...matchingIds].some(
      (id) => !previouslySatisfied.has(id),
    );
    knownElementIdsRef.current = new Set(elements.map((element) => element.id));
    satisfiedIdsRef.current = matchingIds;
    if (hintPending && newlySatisfied) {
      completeHint(currentHint as HintId);
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
