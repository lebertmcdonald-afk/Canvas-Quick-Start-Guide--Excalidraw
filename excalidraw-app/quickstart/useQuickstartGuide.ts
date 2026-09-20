import { useEffect, useRef } from "react";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { useAtom } from "../app-jotai";

import { findFirstUserMark, hasUserMark, nextHint } from "./behavior";
import {
  activeHintAtom,
  completedHintsAtom,
  guideEndedAtom,
  guideOptedInAtom,
} from "./state";

/**
 * Day 16: drives the guide state atoms scaffolded on Day 15.
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
  const [completedHints, setCompletedHints] = useAtom(completedHintsAtom);

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

  const completeHint = (hintId: "shape-tool") => {
    if (!completedHints.includes(hintId)) {
      const nextCompleted = [...completedHints, hintId];
      setCompletedHints(nextCompleted);
      setActiveHint(nextHint(nextCompleted));
    }
  };

  /**
   * Called on every scene change, wired into the existing onChange handler,
   * so it only observes drawing after Excalidraw has applied it -- it can't
   * introduce delay or gate the canvas. Three jobs:
   *  - users the guide doesn't apply to (or who ended it): clear the
   *    baseline and get out immediately (the P0 exit check both days
   *    protect).
   *  - if the user never opted in and just starts drawing on their own,
   *    the prompt gets out of the way on that first interaction (PRD P1).
   *  - if the active hint is one the user just satisfied by authoring a
   *    mark themselves, it completes and disappears on its own, never
   *    repeating. Completion is mark-based (behavior.ts), so imports and
   *    other non-authored content don't count (PRD §3).
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

    const shapeHintPending =
      activeHint === "shape-tool" && !completedHints.includes("shape-tool");

    if (knownElementIdsRef.current === null) {
      // First change since detection started: what's already on the canvas
      // predates the guide, so it baselines instead of counting as new --
      // unless it already includes an authored mark, which satisfies the
      // hint outright (no point teaching a finished step).
      knownElementIdsRef.current = new Set(
        elements.map((element) => element.id),
      );
      if (shapeHintPending && hasUserMark(elements)) {
        completeHint("shape-tool");
      }
      return;
    }

    const createdMark = findFirstUserMark(knownElementIdsRef.current, elements);
    knownElementIdsRef.current = new Set(elements.map((element) => element.id));
    if (shapeHintPending && createdMark) {
      completeHint("shape-tool");
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
