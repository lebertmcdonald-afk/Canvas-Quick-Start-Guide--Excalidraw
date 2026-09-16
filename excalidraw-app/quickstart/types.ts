/**
 * Shared types for the Canvas Quick-Start Guide feature (PRD v2).
 * See this directory's README.md for the module layout and day-by-day
 * ownership from the feature roadmap.
 */

/** The four behavior-based hints, in the order the PRD's response table defines them. */
export type HintId = "shape-tool" | "labeling" | "connecting" | "save";

export const HINT_SEQUENCE: readonly HintId[] = [
  "shape-tool",
  "labeling",
  "connecting",
  "save",
];

/** A/B assignment for the Day 20 control-vs-treatment experiment. */
export type ExperimentGroup = "control" | "treatment";

/**
 * The three Day 15 eligibility signals, exposed individually (not just
 * collapsed into isNewUser) so a later diagnostic -- e.g. the Day 20
 * eligibility event -- can record *why* a user was excluded.
 */
export type EligibilitySignals = {
  hasSavedElements: boolean;
  hasLibraryItems: boolean;
  hasSeenGuide: boolean;
};

/** The five events named in the PRD's Measurement & Experimentation sub-journey. */
export type QuickstartEventName =
  | "eligibility"
  | "exposure"
  | "opt_in"
  | "first_user_authored_action"
  | "save_outcome";

/**
 * Minimal event metadata only. Per the Day 20 P0, this must never carry
 * drawing text, images, or scene contents -- only what's listed here.
 */
export type QuickstartEvent = {
  name: QuickstartEventName;
  group: ExperimentGroup;
  hintId?: HintId;
  timestamp: number;
};
