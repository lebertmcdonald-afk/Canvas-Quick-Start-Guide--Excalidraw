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
 * Hints with real content implemented so far. Day 16 implemented the first;
 * Day 18 adds labeling. Each later day adds its hint here and the chain
 * starts advancing to it automatically once the previous hint completes.
 */
const IMPLEMENTED_HINTS: readonly HintId[] = ["shape-tool", "labeling"];

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

/**
 * Does this element read as a user-added label on a shape? A *bound* text
 * element (containerId set) from double-clicking a shape -- not any text on
 * the canvas, matching the PRD's "double-click a shape to name this step"
 * interaction rather than a freestanding text box.
 */
export const isUserLabel = (element: OrderedExcalidrawElement): boolean =>
  // != null (not !==): a real ExcalidrawTextElement always sets containerId
  // to null when unbound, but this must hold for any object shaped like
  // one, where it may simply be absent (undefined) instead.
  !element.isDeleted && element.type === "text" && element.containerId != null;

/** Same shape as findFirstUserMark, for the labeling hint's completion check. */
export const findFirstUserLabel = (
  knownIds: ReadonlySet<string>,
  elements: readonly OrderedExcalidrawElement[],
): OrderedExcalidrawElement | null =>
  elements.find(
    (element) => !knownIds.has(element.id) && isUserLabel(element),
  ) ?? null;

export const hasUserLabel = (
  elements: readonly OrderedExcalidrawElement[],
): boolean => elements.some((element) => isUserLabel(element));

/**
 * Per-hint completion check: what counts as "the user did this hint's
 * action." Only hints with real detection logic need an entry -- an
 * implemented hint with no entry here would mean it can activate but can
 * never complete, so IMPLEMENTED_HINTS and this map must stay in sync.
 */
export const HINT_COMPLETION: Partial<
  Record<
    HintId,
    {
      hasAny: (elements: readonly OrderedExcalidrawElement[]) => boolean;
      findFirstNew: (
        knownIds: ReadonlySet<string>,
        elements: readonly OrderedExcalidrawElement[],
      ) => OrderedExcalidrawElement | null;
    }
  >
> = {
  "shape-tool": { hasAny: hasUserMark, findFirstNew: findFirstUserMark },
  labeling: { hasAny: hasUserLabel, findFirstNew: findFirstUserLabel },
};
