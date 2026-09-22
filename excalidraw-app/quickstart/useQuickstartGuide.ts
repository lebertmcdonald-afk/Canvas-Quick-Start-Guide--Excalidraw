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

export type SceneChangeMeta = {
  /** True when this scene write came from a collaborator, not the local user. */
  isRemote?: boolean;
};

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

  // Element ids on the canvas when scene detection last looked, while the
  // guide is active. Null whenever it isn't, so users the guide doesn't
  // apply to never pay for any of this.
  const knownElementIdsRef = useRef<ReadonlySet<string> | null>(null);
  // After a Help-menu restart, existing canvas content is baselined and
  // must not instantly complete hints or dismiss the prompt (P1).
  const skipBaselineCompletionRef = useRef(false);
  // Ids that already satisfied the *current* hint last time we looked.
  // Re-seeded when the hint changes, so existing content doesn't finish
  // the new hint -- but an arrow created unbound and bound a moment later
  // (same id, newly qualifying) still does.
  const satisfiedIdsRef = useRef<ReadonlySet<string>>(new Set());
  const lastElementsRef = useRef<readonly OrderedExcalidrawElement[]>([]);
  // Excalidraw can fire onChange more than once before React re-renders,
  // so scene detection reads the live values here rather than the closure.
  const activeHintRef = useRef(activeHint);
  activeHintRef.current = activeHint;

  const guideApplies = (isNewUser === true || forcedVisible) && !ended;
  const isVisible = guideApplies;

  const matchingIdsFor = (
    hint: HintId | null,
    elements: readonly OrderedExcalidrawElement[],
  ): ReadonlySet<string> => {
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
        activeHintRef.current = next;
        satisfiedIdsRef.current = matchingIdsFor(next, lastElementsRef.current);
      }
    }
    // matchingIdsFor only reads refs; listing it would re-run this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optedIn, ended, completedHints, activeHint, setActiveHint]);

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
    setActiveHint(firstHint);
    activeHintRef.current = firstHint;
    knownElementIdsRef.current = null;
    skipBaselineCompletionRef.current = true;
    satisfiedIdsRef.current = new Set();
  };

  const completeHint = (hintId: HintId) => {
    completeHintImperatively(hintId);
    // Re-seed against the scene as it stands *now*, before React paints
    // the new hint, so the next onChange can't mistake already-present
    // content for the user doing the new step.
    const next = appJotaiStore.get(activeHintAtom);
    activeHintRef.current = next;
    satisfiedIdsRef.current = matchingIdsFor(next, lastElementsRef.current);
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
   *  - a collaborator's edits are baselined, never treated as the local
   *    user doing the step (meta.isRemote, set by Collab).
   */
  const notifySceneChange = (
    elements: readonly OrderedExcalidrawElement[],
    meta?: SceneChangeMeta,
  ) => {
    lastElementsRef.current = elements;
    const isRemote = meta?.isRemote === true;

    if (!guideApplies) {
      knownElementIdsRef.current = null;
      return;
    }

    if (!optedIn) {
      // A collaborator's edit must not dismiss the prompt: P1 is the
      // *local* user starting to draw on their own.
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
    const completion = currentHint ? HINT_COMPLETION[currentHint] : undefined;
    const hintPending =
      completion !== undefined &&
      currentHint !== null &&
      !completedHints.includes(currentHint);
    const matchingIds = matchingIdsFor(currentHint, elements);

    if (isRemote) {
      // Baseline the collaborator's work -- including anything of theirs
      // that happens to satisfy this hint -- so only a later local action
      // can complete it.
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
      satisfiedIdsRef.current = matchingIds;
      if (skipBaselineCompletionRef.current) {
        skipBaselineCompletionRef.current = false;
        return;
      }
      if (hintPending && completion.hasAny(elements)) {
        completeHint(currentHint as HintId);
      }
      return;
    }

    // Newly *satisfying*, not merely newly created: Excalidraw draws an
    // arrow unbound and binds it afterwards, so waiting for a new id
    // alone leaves the connecting hint stuck on screen forever.
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
