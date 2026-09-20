import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { HINT_SEQUENCE } from "./types";

import type { HintId } from "./types";

/**
 * Element types that count as the user making an authored mark on the canvas.
 * Excludes image/embeddable (usually imports, which must not read as user
 * authorship -- PRD §3, Measurement) and frame (a container, not a mark).
 */
const USER_MARK_ELEMENT_TYPES = new Set<string>([
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
]);

/**
 * Hints with real content implemented so far. Day 16 implements only the
 * first; each later day adds its hint here and the chain starts advancing to
 * it automatically once the previous hint completes.
 */
const IMPLEMENTED_HINTS: readonly HintId[] = ["shape-tool"];

/** The first implemented hint the user hasn't completed yet, or null. */
export const nextHint = (completedHints: readonly HintId[]): HintId | null =>
  HINT_SEQUENCE.find(
    (hint) =>
      IMPLEMENTED_HINTS.includes(hint) && !completedHints.includes(hint),
  ) ?? null;

/** Does this element read as a user-authored mark? */
export const isUserMark = (element: OrderedExcalidrawElement): boolean =>
  !element.isDeleted && USER_MARK_ELEMENT_TYPES.has(element.type);

/**
 * The first element in `elements` that is new relative to `knownIds` and
 * reads as a user-authored mark, or null. New elements whose ids are already
 * known -- e.g. system-inserted starter content baselined before the guide
 * started watching -- don't count.
 */
export const findFirstUserMark = (
  knownIds: ReadonlySet<string>,
  elements: readonly OrderedExcalidrawElement[],
): OrderedExcalidrawElement | null =>
  elements.find(
    (element) => !knownIds.has(element.id) && isUserMark(element),
  ) ?? null;

export const hasUserMark = (
  elements: readonly OrderedExcalidrawElement[],
): boolean => elements.some((element) => isUserMark(element));
