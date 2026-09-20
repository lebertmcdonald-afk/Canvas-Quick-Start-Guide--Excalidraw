import { useEffect, useState } from "react";

import { STORAGE_KEYS } from "../app_constants";
import { LibraryIndexedDBAdapter } from "../data/LocalData";

import type { EligibilitySignals } from "./types";

/**
 * Day 15 eligibility check.
 *
 * A browser only counts as a "new" canvas user if all three signals agree:
 * no saved elements, no saved library items, and it hasn't seen the
 * quickstart guide before. Any one of those being true means this is a
 * returning guest, not a first-time visitor, so the prompt stays hidden.
 *
 * isNewUser is `null` while the (async) library check is still in flight,
 * so callers can avoid flashing the prompt before we know the real answer.
 * signals exposes the individual checks so a later diagnostic (e.g. Day
 * 20's eligibility event) can record *why* a user was excluded.
 */
export const useIsNewCanvasUser = () => {
  const [isNewUser, setIsNewUser] = useState<boolean | null>(null);
  const [signals, setSignals] = useState<EligibilitySignals | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkEligibility = async () => {
      const hasSavedElements = hasNonEmptyLocalElements();
      const hasSeenGuide =
        localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_QUICKSTART_SEEN) ===
        "true";
      const hasLibraryItems = await hasNonEmptyLibrary();

      if (!cancelled) {
        setSignals({ hasSavedElements, hasLibraryItems, hasSeenGuide });
        setIsNewUser(!hasSavedElements && !hasLibraryItems && !hasSeenGuide);
      }
    };

    checkEligibility();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Persists the "has seen the guide" flag for *future* sessions. This
   * intentionally does not touch isNewUser: the flag means "shown before,"
   * not "done with" -- it's called once the guide is exposed, and the
   * current session's guide visibility is controlled by the opt-in/end-guide
   * flow (see useQuickstartGuide), not by re-deriving eligibility mid-session.
   */
  const markGuideSeen = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.LOCAL_STORAGE_QUICKSTART_SEEN, "true");
    } catch (error: any) {
      // Unable to access localStorage
      console.error(error);
    }
  };

  return { isNewUser, signals, markGuideSeen };
};

const hasNonEmptyLocalElements = (): boolean => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS);
    if (!saved) {
      return false;
    }
    const elements = JSON.parse(saved);
    return Array.isArray(elements) && elements.length > 0;
  } catch (error: any) {
    console.error(error);
    // if we can't read it, don't block the check on it
    return false;
  }
};

const hasNonEmptyLibrary = async (): Promise<boolean> => {
  try {
    const libraryData = await LibraryIndexedDBAdapter.load();
    return Boolean(libraryData?.libraryItems?.length);
  } catch (error: any) {
    console.error(error);
    return false;
  }
};
