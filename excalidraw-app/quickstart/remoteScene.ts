/**
 * Tracks which element versions were just written by a remote
 * collaborator's scene update, so a later onChange can tell a
 * collaborator's edit from the local user's own -- by element id+version,
 * not by a synchronously-cleared flag.
 *
 * A synchronous "this call is remote" flag doesn't work here: Collab wraps
 * `updateScene()` for a remote update, but Excalidraw's onChange fires
 * *asynchronously* relative to that call (observed 5-10ms later against a
 * real collab session, not same-tick) -- so a flag cleared right after
 * updateScene() returns is already false by the time onChange checks it,
 * and a collaborator's edit reads as the local user's own. Tracking by
 * id+version survives that gap regardless of its length, and self-expires
 * correctly: once the local user edits that same element, its version
 * bumps past what's recorded here, so it stops matching on its own.
 */

let pendingRemoteVersions = new Map<string, number>();

export const markRemoteSceneUpdate = (
  elements: readonly { id: string; version: number }[],
) => {
  for (const element of elements) {
    pendingRemoteVersions.set(element.id, element.version);
  }
};

/** Was this element's current version just written by a remote update? */
export const isRemoteElementVersion = (element: {
  id: string;
  version: number;
}): boolean => pendingRemoteVersions.get(element.id) === element.version;

/** Test-only. */
export const resetRemoteSceneUpdate = () => {
  pendingRemoteVersions = new Map();
};
