# Canvas Quick-Start Guide

Feature module for the Canvas Quick-Start Guide (PRD v2 — see [`/docs/Canvas Quick-Start Guide PRD.pdf`](../../docs/Canvas%20Quick-Start%20Guide%20PRD.pdf) and [`/docs/Canvas Quick-Start Guide - Feature Roadmap.pdf`](../../docs/Canvas%20Quick-Start%20Guide%20-%20Feature%20Roadmap.pdf)). Everything the guide needs lives here so Days 15–20 don't collide on shared app files.

| File | Owns | Day |
| --- | --- | --- |
| `useIsNewCanvasUser.ts` | Eligibility check (3 signals) | Day 15 — Lebert |
| `useQuickstartGuide.ts` | Guide behavior: opt-in, hint progression, end-guide, exposure→seen-flag, scene detection | Day 16 — Jason, extended Day 18 — Lebert |
| `QuickstartGuide.tsx` | Prompt + hint UI (incl. the shape-tool toolbar highlight, the "How to start" link) | Day 16 — Jason, extended Day 18 — Lebert |
| `QuickstartHelpButton.tsx` | Help dialog "Getting started" button to reopen a dismissed guide | Day 18 — Mofazzal |
| `behavior.ts` | Pure logic: what counts as a user-authored mark/label, hint progression, per-hint completion checks | Day 16 — Jason, extended Day 18 — Lebert / Mofazzal |
| `types.ts` | Shared types: hint IDs, experiment group, event names | infra |
| `state.ts` | Shared guide state (Jotai atoms) | infra |

## What's built vs. what's scaffolded

- **Day 15 (done):** eligibility check is real and wired into `excalidraw-app/App.tsx`. A browser is "new" only if it has no saved elements, no library items, and no seen-guide flag.
- **Day 16 (done):** opt-in prompt is real (two working actions, not a placeholder, plus a "How to start with Excalidraw" link to `plus.excalidraw.com/how-to-start`); the first hint (`shape-tool`) shows once opted in — with a pulsing highlight on the toolbar's shape buttons — and disappears on its own the moment the user authors a shape themselves, detected via the existing `onChange` scene-change callback; the "end the guide" control actually suppresses further guide state; a user who never interacts with any of it still gets an unblocked, undelayed canvas (P0, re-verified — see `tests/quickstart.test.tsx`) since `onChange` only _observes_ scene changes after Excalidraw has already applied them -- it can't gate or slow drawing. `markGuideSeen()` fires on exposure (first time the prompt is shown to a new user), not on completion -- see the comment on it in `useIsNewCanvasUser.ts` for why that distinction matters.
- **Day 18 (done):** the `labeling` hint ("Double-click a shape to name this step," matching the PRD's exact copy) is real -- it auto-activates once `shape-tool` completes, and completes itself the moment the user adds a genuine _bound_ label to a shape (`containerId` set), not just any text on the canvas. The `connecting` hint ("Draw an arrow to connect two shapes") is real too -- it auto-activates once `labeling` completes, and completes itself the moment the user draws an arrow bound at _both_ ends to two _different_ shapes (a stray unbound arrow, one bound end, or a self-loop don't count). All verified by hand in-browser, not just typechecked -- including tracking down a false alarm where double-clicking an unfilled shape didn't actually bind the text; selecting the shape and pressing Enter did (not a code bug, a quirk of that specific interaction).

  Detection generalized rather than duplicated: `notifySceneChange` no longer hardcodes shape-tool. It looks up the active hint's completion check in `behavior.ts`'s `HINT_COMPLETION` map (`hasAny` / `findFirstNew`, one entry per hint with real detection), so a future hint just needs a `behavior.ts` entry and a render branch in `QuickstartGuide.tsx` -- the hook itself doesn't change. Two detection rules stay deliberately different, per hint:

  - **Prompt-clear (PRD P1):** a user who never opted in gets the prompt out of the way on their first canvas interaction — any content counts.
  - **Hint completion (PRD P0):** per-hint and mark-aware. `shape-tool` wants any authored mark (not images/imports, per PRD §3); `labeling` wants specifically a bound text label; `connecting` wants an arrow bound at both ends to two different shapes. Either way, only new elements (not present when detection started) count, and only once.

- **Help-menu restart (done):** a "Getting started" button in the Help dialog header (same `HelpDialog__btn` style as Documentation / Blog / GitHub / YouTube) reopens the guide after dismiss, including for returning browsers that would otherwise fail eligibility. Existing canvas content is baselined so it doesn't instantly complete the first hint.
- **Save hint (done):** after connecting, the `save` hint asks the user to save so they can come back. It completes only on an explicit save gesture (`markExplicitlySaved` — menu Save / Export / Save as image, Ctrl/Cmd+S, or export to Excalidraw+), not on autosave or further drawing. If they already saved this scene, the hint is skipped.
- **Remote collaborator edits (done):** Collab marks remote `updateScene` writes. Those elements are baselined so they cannot complete a hint or dismiss the opt-in prompt (P1 is the local user starting to draw). A later local mark still completes the active hint as usual.
- **Not built yet:** analytics wiring for the five `QuickstartEventName`s:
  - Day 20 (Jason): analytics wiring for the five `QuickstartEventName`s, control/treatment comparison.

## Conventions

- Shared state uses Jotai atoms (`../app-jotai`), matching the rest of `excalidraw-app` (see `collabAPIAtom`, `shareDialogStateAtom`) — not React Context. Anything reading/writing the atoms outside React must go through `appJotaiStore`, the same store `<Provider>` mounts in `App.tsx`.
- `QuickstartEvent` must never carry drawing text, images, or scene contents (Day 20 P0, PRD §3). Metadata only.
- Eligibility stays on-device (`localStorage` + IndexedDB), not account-based — a returning guest who's never signed up must still read as not-new (PRD §1b).
