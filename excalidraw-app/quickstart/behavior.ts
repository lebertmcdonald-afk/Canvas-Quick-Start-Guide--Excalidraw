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

/** Shapes the labeling hint is teaching: Enter binds a label to these. */
const LABELABLE_SHAPE_TYPES = new Set<string>([
  "rectangle",
  "diamond",
  "ellipse",
]);

/**
 * Hints with real content implemented so far. Save stays off the chain until
 * save-state confirmation lands; labeling + connecting advance automatically
 * once shape-tool completes.
 */
const IMPLEMENTED_HINTS: readonly HintId[] = [
  "shape-tool",
  "labeling",
  "connecting",
];

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

const elementsById = (
  elements: readonly OrderedExcalidrawElement[],
): ReadonlyMap<string, OrderedExcalidrawElement> =>
  new Map(elements.map((element) => [element.id, element]));

/**
 * Container ids of labelable shapes that currently have a bound, non-empty
 * label. Empty in-progress text (Enter just pressed) does not count -- the
 * user has to type something.
 */
export const findLabeledContainerIds = (
  elements: readonly OrderedExcalidrawElement[],
): ReadonlySet<string> => {
  const byId = elementsById(elements);
  const labeled = new Set<string>();

  for (const element of elements) {
    if (element.isDeleted || element.type !== "text") {
      continue;
    }
    if (!element.containerId || !element.text.trim()) {
      continue;
    }
    const container = byId.get(element.containerId);
    if (
      container &&
      !container.isDeleted &&
      LABELABLE_SHAPE_TYPES.has(container.type)
    ) {
      labeled.add(container.id);
    }
  }

  return labeled;
};

/**
 * Arrow ids whose start and end are bound to two different, still-present
 * elements. A stray arrow on empty canvas has neither binding and must not
 * complete the connecting hint -- both ends have to actually bind.
 */
export const findConnectingArrowIds = (
  elements: readonly OrderedExcalidrawElement[],
): ReadonlySet<string> => {
  const byId = elementsById(elements);
  const connected = new Set<string>();

  for (const element of elements) {
    if (element.isDeleted || element.type !== "arrow") {
      continue;
    }
    const startId = element.startBinding?.elementId;
    const endId = element.endBinding?.elementId;
    if (!startId || !endId || startId === endId) {
      continue;
    }
    const start = byId.get(startId);
    const end = byId.get(endId);
    if (start && !start.isDeleted && end && !end.isDeleted) {
      connected.add(element.id);
    }
  }

  return connected;
};

/** First id in `current` that was not already in `known`, or null. */
export const findFirstNewId = (
  known: ReadonlySet<string>,
  current: ReadonlySet<string>,
): string | null => {
  for (const id of current) {
    if (!known.has(id)) {
      return id;
    }
  }
  return null;
};
