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
 * Day 18 adds labeling and connecting. Each later day adds its hint here and
 * the chain starts advancing to it automatically once the previous hint
 * completes.
 */
const IMPLEMENTED_HINTS: readonly HintId[] = [
  "shape-tool",
  "labeling",
  "connecting",
  "save",
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
 * Shapes the connecting hint is teaching. Bound labels sit on these and
 * must resolve back to the container — Excalidraw will not bind an arrow
 * to a containerId text, so a drag that starts on the label often has
 * null startBinding even though the user clearly connected two steps.
 */
const CONNECTABLE_SHAPE_TYPES = new Set<string>([
  "rectangle",
  "diamond",
  "ellipse",
]);

const NEAR_SHAPE_PADDING = 16;

type ScenePoint = { x: number; y: number };

const pointHitsElement = (
  point: ScenePoint,
  element: OrderedExcalidrawElement,
  padding: number,
): boolean => {
  const width = typeof element.width === "number" ? element.width : 0;
  const height = typeof element.height === "number" ? element.height : 0;
  return (
    point.x >= element.x - padding &&
    point.x <= element.x + width + padding &&
    point.y >= element.y - padding &&
    point.y <= element.y + height + padding
  );
};

const getArrowEndpoints = (
  element: OrderedExcalidrawElement,
): { start: ScenePoint; end: ScenePoint } | null => {
  if (element.type !== "arrow" || !("points" in element)) {
    return null;
  }
  const points = element.points;
  if (!Array.isArray(points) || points.length < 2) {
    return null;
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (
    !Array.isArray(first) ||
    !Array.isArray(last) ||
    typeof first[0] !== "number" ||
    typeof last[0] !== "number"
  ) {
    return null;
  }
  return {
    start: { x: element.x + first[0], y: element.y + first[1] },
    end: { x: element.x + last[0], y: element.y + last[1] },
  };
};

const resolveBoundShapeId = (
  binding: { elementId?: string } | null | undefined,
  elements: readonly OrderedExcalidrawElement[],
): string | null => {
  const id = binding?.elementId;
  if (!id) {
    return null;
  }
  const target = elements.find((element) => element.id === id);
  if (target?.isDeleted) {
    return null;
  }
  if (target?.type === "text" && target.containerId != null) {
    return target.containerId;
  }
  return id;
};

const resolveShapeIdNearPoint = (
  point: ScenePoint,
  elements: readonly OrderedExcalidrawElement[],
): string | null => {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (element.isDeleted) {
      continue;
    }
    if (element.type === "text" && element.containerId != null) {
      const container = elements.find(
        (item) => item.id === element.containerId,
      );
      if (
        (container && pointHitsElement(point, container, NEAR_SHAPE_PADDING)) ||
        pointHitsElement(point, element, NEAR_SHAPE_PADDING)
      ) {
        return element.containerId;
      }
    }
    if (
      CONNECTABLE_SHAPE_TYPES.has(element.type) &&
      pointHitsElement(point, element, NEAR_SHAPE_PADDING)
    ) {
      return element.id;
    }
  }
  return null;
};

/**
 * Does this element read as the user connecting two shapes? Official
 * bindings at both ends to two different shapes count, and so does an
 * arrow whose endpoints sit on (or next to) two different shapes — the
 * real arrow tool often creates the element unbound, then binds the same
 * id, and a drag that starts on a label frequently never binds at all.
 */
export const isUserConnection = (
  element: OrderedExcalidrawElement,
  elements: readonly OrderedExcalidrawElement[] = [],
): boolean => {
  if (element.isDeleted || element.type !== "arrow") {
    return false;
  }

  const endpoints = getArrowEndpoints(element);
  const startId =
    resolveBoundShapeId(element.startBinding, elements) ??
    (endpoints ? resolveShapeIdNearPoint(endpoints.start, elements) : null);
  const endId =
    resolveBoundShapeId(element.endBinding, elements) ??
    (endpoints ? resolveShapeIdNearPoint(endpoints.end, elements) : null);

  return startId != null && endId != null && startId !== endId;
};

/** Same shape as findFirstUserMark, for the connecting hint's completion check. */
export const findFirstUserConnection = (
  knownIds: ReadonlySet<string>,
  elements: readonly OrderedExcalidrawElement[],
): OrderedExcalidrawElement | null =>
  elements.find(
    (element) =>
      !knownIds.has(element.id) && isUserConnection(element, elements),
  ) ?? null;

export const hasUserConnection = (
  elements: readonly OrderedExcalidrawElement[],
): boolean => elements.some((element) => isUserConnection(element, elements));

/**
 * Per-hint completion check: what counts as "the user did this hint's
 * action." Only hints with real detection logic need an entry -- an
 * implemented hint with no entry here would mean it can activate but can
 * never complete, so IMPLEMENTED_HINTS and this map must stay in sync.
 * `save` is the exception: it completes on markExplicitlySaved(), not a
 * scene element, so it has no entry here.
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
      isSatisfied: (
        element: OrderedExcalidrawElement,
        elements: readonly OrderedExcalidrawElement[],
      ) => boolean;
    }
  >
> = {
  "shape-tool": {
    hasAny: hasUserMark,
    findFirstNew: findFirstUserMark,
    isSatisfied: isUserMark,
  },
  labeling: {
    hasAny: hasUserLabel,
    findFirstNew: findFirstUserLabel,
    isSatisfied: isUserLabel,
  },
  connecting: {
    hasAny: hasUserConnection,
    findFirstNew: findFirstUserConnection,
    isSatisfied: isUserConnection,
  },
};
