/**
 * Which elements a collaborator wrote, so the guide can tell their work
 * from the local user's: remote elements baseline instead of completing a
 * hint or dismissing the opt-in prompt.
 *
 * Attribution is by element id rather than by "are we inside a remote
 * update right now": Excalidraw calls onChange from componentDidUpdate,
 * long after Collab's updateScene call has returned, so any flag set
 * around that call is already back off by the time the guide hears about
 * the change (this is exactly how the first version of this guard slipped
 * through unit tests and then failed in a live session).
 */

let pendingRemoteIds = new Set<string>();

export const markRemoteElementIds = (ids: Iterable<string>) => {
  for (const id of ids) {
    pendingRemoteIds.add(id);
  }
};

/**
 * Hands over the ids written remotely since the last call, and clears
 * them -- the guide keeps its own running set, so each id only needs to be
 * reported once.
 */
export const takeRemoteElementIds = (): ReadonlySet<string> => {
  if (pendingRemoteIds.size === 0) {
    return EMPTY_REMOTE_IDS;
  }
  const taken = pendingRemoteIds;
  pendingRemoteIds = new Set();
  return taken;
};

const EMPTY_REMOTE_IDS: ReadonlySet<string> = new Set();

/** Test-only. */
export const resetRemoteElementIds = () => {
  pendingRemoteIds = new Set();
};
