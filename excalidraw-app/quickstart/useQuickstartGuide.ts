import { useEffect } from "react";

import { useAtom } from "../app-jotai";

import {
  activeHintAtom,
  completedHintsAtom,
  guideEndedAtom,
  guideOptedInAtom,
} from "./state";
import { HINT_SEQUENCE } from "./types";

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

  const isVisible = isNewUser === true && !ended;

  useEffect(() => {
    if (isNewUser === true) {
      markGuideSeen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewUser]);

  // Once opted in, the first hint in the chain goes active until
  // completed. Day 16 only builds that first hint's content; Day 17/18
  // extend this to advance through the rest of HINT_SEQUENCE.
  useEffect(() => {
    if (optedIn && !ended && completedHints.length === 0 && !activeHint) {
      setActiveHint(HINT_SEQUENCE[0]);
    }
  }, [optedIn, ended, completedHints, activeHint, setActiveHint]);

  const optIn = () => setOptedIn(true);

  /** The explicit, visible "end the guide" control -- PRD P0. */
  const endGuide = () => {
    setEnded(true);
    setActiveHint(null);
  };

  /**
   * Called on every scene change. Two jobs:
   *  - if the user never opted in and just starts drawing on their own,
   *    the prompt gets out of the way on that first interaction (PRD P1).
   *  - if the active hint is the one the user just satisfied by drawing,
   *    it disappears on its own rather than needing a manual dismiss.
   */
  const notifyElementCount = (elementCount: number) => {
    if (elementCount === 0) {
      return;
    }
    if (!optedIn) {
      endGuide();
      return;
    }
    if (activeHint === HINT_SEQUENCE[0]) {
      setCompletedHints((prev) =>
        prev.includes(activeHint) ? prev : [...prev, activeHint],
      );
      setActiveHint(null);
    }
  };

  return { isVisible, optedIn, activeHint, optIn, endGuide, notifyElementCount };
};
