import { STORAGE_KEYS } from "../app_constants";

import { HINT_SEQUENCE } from "./types";

import type { HintId } from "./types";

/**
 * Where the user got to in the guide, persisted so a reload picks the
 * chain back up instead of silently dropping them out of it: guide state
 * lives in memory (state.ts), and once they've drawn anything the
 * eligibility check no longer reads them as a new user, so without this
 * their only way back in would be Help -> "Show guide".
 *
 * Only written once the user has opted in, and cleared as soon as they
 * end the guide or finish the chain -- a user who never took part leaves
 * nothing behind (PRD P0, no side effects for non-participants).
 */
export type QuickstartProgress = {
  completedHints: HintId[];
};

const isHintId = (value: unknown): value is HintId =>
  typeof value === "string" && HINT_SEQUENCE.includes(value as HintId);

export const readGuideProgress = (): QuickstartProgress | null => {
  try {
    const saved = localStorage.getItem(
      STORAGE_KEYS.LOCAL_STORAGE_QUICKSTART_PROGRESS,
    );
    if (!saved) {
      return null;
    }
    const parsed = JSON.parse(saved);
    // hand-edited or stale-format storage must never break the editor
    if (!parsed || !Array.isArray(parsed.completedHints)) {
      return null;
    }
    return { completedHints: parsed.completedHints.filter(isHintId) };
  } catch (error: any) {
    console.error(error);
    return null;
  }
};

export const writeGuideProgress = (progress: QuickstartProgress) => {
  try {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_QUICKSTART_PROGRESS,
      JSON.stringify(progress),
    );
  } catch (error: any) {
    // unable to access localStorage
    console.error(error);
  }
};

export const clearGuideProgress = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.LOCAL_STORAGE_QUICKSTART_PROGRESS);
  } catch (error: any) {
    console.error(error);
  }
};
