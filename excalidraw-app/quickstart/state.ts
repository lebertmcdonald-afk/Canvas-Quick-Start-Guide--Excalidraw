import { atom } from "../app-jotai";

import type { HintId } from "./types";

/**
 * Guide state, as Jotai atoms -- matching this app's existing shared-state
 * convention (see collabAPIAtom, shareDialogStateAtom) rather than
 * introducing React Context.
 *
 * These are state slots only. Deciding *when* they change (e.g. detecting
 * that a user drew a shape) is each day's behavior work, not part of this
 * scaffold.
 */

/** Has the user opted in to the guide from the initial prompt? */
export const guideOptedInAtom = atom(false);

/** Which hint, if any, is currently being shown. */
export const activeHintAtom = atom<HintId | null>(null);

/** Hints the user has already completed, so they never repeat. */
export const completedHintsAtom = atom<HintId[]>([]);

/** Has the user hit the explicit "end the guide" control? */
export const guideEndedAtom = atom(false);
