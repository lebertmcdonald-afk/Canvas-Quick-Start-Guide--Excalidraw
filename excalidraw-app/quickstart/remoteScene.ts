/**
 * Marks the next scene write as coming from a collaborator, not the local
 * user. Collab wraps remote updateScene calls so the guide can baseline
 * those elements without treating them as hint completions (or as the
 * user's first content, which would dismiss the prompt).
 *
 * Depth-counted so nested updateScene calls stay marked remote.
 */

let remoteSceneUpdateDepth = 0;

export const beginRemoteSceneUpdate = () => {
  remoteSceneUpdateDepth += 1;
};

export const endRemoteSceneUpdate = () => {
  remoteSceneUpdateDepth = Math.max(0, remoteSceneUpdateDepth - 1);
};

export const isRemoteSceneUpdate = () => remoteSceneUpdateDepth > 0;

/** Test-only. */
export const resetRemoteSceneUpdate = () => {
  remoteSceneUpdateDepth = 0;
};
