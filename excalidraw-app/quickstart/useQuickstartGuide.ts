import { useEffect, useRef } from "react";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { useAtom } from "../app-jotai";

import {
  findConnectingArrowIds,
  findFirstNewId,
  findFirstUserMark,
  findLabeledContainerIds,
  hasUserMark,
  nextHint,
} from "./behavior";
import {
  activeHintAtom,
  completedHintsAtom,
  guideEndedAtom,
  guideForcedVisibleAtom,
  guideOptedInAtom,
} from "./state";

import type { HintId } from "./types";

export type SceneChangeMeta = {
  /** True while the user is still in the text editor (Enter-to-label). */
  isEditingText?: boolean;
};

/**
 * Day 16 + Day 18: drives the guide state atoms scaffolded on Day 15.
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
  const [forcedVisible, setForcedVisible] = useAtom(guideForcedVisibleAtom);
  const [activeHint, setActiveHint] = useAtom(activeHintAtom);
  const [completedHints, setCompletedHints] = useAtom(completedHintsAtom);

  // Element ids on the canvas when scene detection last looked, while the
  // guide is active. Null whenever it isn't, so users the guide doesn't
  // apply to never pay for any of this.
  const knownElementIdsRef = useRef<ReadonlySet<string> | null>(null);
  // Shapes already labeled / arrows already connecting two shapes, so
  // starter content, imports, and remote scene dumps get baselined instead
  // of counting as the user completing the hint.
  const knownLabeledIdsRef = useRef<ReadonlySet<string> | null>(null);
  const knownConnectedIdsRef = useRef<ReadonlySet<string> | null>(null);
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
    knownLabeledIdsRef.current = null;
    knownConnectedIdsRef.current = null;
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
    knownLabeledIdsRef.current = null;
    knownConnectedIdsRef.current = null;
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
   *    baselines and get out immediately (the P0 exit check).
   *  - if the user never opted in and just starts drawing on their own,
   *    the prompt gets out of the way on that first interaction (PRD P1).
   *  - if the active hint is one the user just satisfied, it completes
   *    and disappears on its own, never repeating.
   *
   * Shape-tool completion is mark-based (new authored element). Labeling
   * waits until bound text has content *and* the editor is closed, so an
   * empty Enter or mid-type state doesn't advance. Connecting requires an
   * arrow bound at both ends to two different shapes -- a stray unbound
   * arrow does not count.
   */
  const notifySceneChange = (
    elements: readonly OrderedExcalidrawElement[],
    meta?: SceneChangeMeta,
  ) => {
    if (!guideApplies) {
      knownElementIdsRef.current = null;
      knownLabeledIdsRef.current = null;
      knownConnectedIdsRef.current = null;
      return;
    }

    if (!optedIn) {
      if (elements.length > 0) {
        endGuide();
      }
      return;
    }

    const labeledIds = findLabeledContainerIds(elements);
    const connectedIds = findConnectingArrowIds(elements);

    if (knownElementIdsRef.current === null) {
      // First change since detection started: what's already on the canvas
      // predates the guide, so it baselines instead of counting as new --
      // unless it already includes an authored mark, which satisfies the
      // shape hint outright (no point teaching a finished step).
      knownElementIdsRef.current = new Set(
        elements.map((element) => element.id),
      );
      knownLabeledIdsRef.current = labeledIds;
      knownConnectedIdsRef.current = connectedIds;
      if (skipBaselineCompletionRef.current) {
        skipBaselineCompletionRef.current = false;
        return;
      }
      if (
        activeHint === "shape-tool" &&
        !completedHints.includes("shape-tool") &&
        hasUserMark(elements)
      ) {
        completeHint("shape-tool");
      }
      return;
    }

    const createdMark = findFirstUserMark(knownElementIdsRef.current, elements);
    knownElementIdsRef.current = new Set(elements.map((element) => element.id));

    if (
      activeHint === "shape-tool" &&
      !completedHints.includes("shape-tool") &&
      createdMark
    ) {
      completeHint("shape-tool");
    }

    if (activeHint === "labeling" && !completedHints.includes("labeling")) {
      const knownLabeled = knownLabeledIdsRef.current ?? new Set<string>();
      const newLabel = findFirstNewId(knownLabeled, labeledIds);
      // Don't baseline an in-progress label: otherwise Escape after typing
      // would see the container as already-known and never complete.
      if (newLabel && !meta?.isEditingText) {
        knownLabeledIdsRef.current = labeledIds;
        completeHint("labeling");
      }
    } else {
      knownLabeledIdsRef.current = labeledIds;
    }

    if (activeHint === "connecting" && !completedHints.includes("connecting")) {
      const knownConnected = knownConnectedIdsRef.current ?? new Set<string>();
      const newConnection = findFirstNewId(knownConnected, connectedIds);
      knownConnectedIdsRef.current = connectedIds;
      if (newConnection) {
        completeHint("connecting");
      }
    } else {
      knownConnectedIdsRef.current = connectedIds;
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
