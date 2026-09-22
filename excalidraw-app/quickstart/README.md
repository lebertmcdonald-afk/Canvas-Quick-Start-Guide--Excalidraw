# Canvas Quick-Start Guide

Feature module for the Canvas Quick-Start Guide (PRD v2 — see [`/docs/Canvas Quick-Start Guide PRD.pdf`](../../docs/Canvas%20Quick-Start%20Guide%20PRD.pdf) and [`/docs/Canvas Quick-Start Guide - Feature Roadmap.pdf`](../../docs/Canvas%20Quick-Start%20Guide%20-%20Feature%20Roadmap.pdf)). Everything the guide needs lives here so Days 15–20 don't collide on shared app files.

| File | Owns | Day |
| --- | --- | --- |
| `useIsNewCanvasUser.ts` | Eligibility check (3 signals) | Day 15 — Lebert |
| `useQuickstartGuide.ts` | Guide behavior: opt-in, first hint, end-guide, exposure→seen-flag, scene detection | Day 16 — Jason |
| `QuickstartGuide.tsx` | Prompt + hint UI (incl. the shape-tool toolbar highlight) | Day 16 — Jason |
| `QuickstartHelpButton.tsx` | Help dialog "Getting started" button to reopen a dismissed guide | Day 18 — Mofazzal |
| `behavior.ts` | Pure logic: what counts as a user-authored mark, hint progression | Day 16 — Jason |
| `types.ts` | Shared types: hint IDs, experiment group, event names | infra |
| `state.ts` | Shared guide state (Jotai atoms) | infra |

## What's built vs. what's scaffolded

- **Day 15 (done):** eligibility check is real and wired into `excalidraw-app/App.tsx`. A browser is "new" only if it has no saved elements, no library items, and no seen-guide flag.
- **Day 16 (done):** opt-in prompt is real (two working actions, not a placeholder); the first hint (`shape-tool`) shows once opted in — with a pulsing highlight on the toolbar's shape buttons — and disappears on its own the moment the user authors a shape themselves, detected via the existing `onChange` scene-change callback; the "end the guide" control actually suppresses further guide state; a user who never interacts with any of it still gets an unblocked, undelayed canvas (P0, re-verified — see `tests/quickstart.test.tsx`) since `onChange` only _observes_ scene changes after Excalidraw has already applied them -- it can't gate or slow drawing. `markGuideSeen()` fires on exposure (first time the prompt is shown to a new user), not on completion -- see the comment on it in `useIsNewCanvasUser.ts` for why that distinction matters.

  Two detection rules, deliberately different (both in `useQuickstartGuide.notifySceneChange`, logic in `behavior.ts`):

  - **Prompt-clear (PRD P1):** a user who never opted in gets the prompt out of the way on their first canvas interaction — any content counts.
  - **Hint completion (PRD P0):** mark-based. Only elements the user authored themselves (shapes, arrows, lines, freedraw, text — not images/imports, per PRD §3) complete the hint, and only once; elements that predate opting in are baselined, not counted.

- **Help-menu restart (done):** a "Getting started" button in the Help dialog header (same `HelpDialog__btn` style as Documentation / Blog / GitHub / YouTube) reopens the guide after dismiss, including for returning browsers that would otherwise fail eligibility. Existing canvas content is baselined so it doesn't instantly complete the first hint.
- **Day 18 (done, minus save):** `labeling` and `connecting` are on the chain. After a shape, the labeling hint waits for bound, non-empty text *and* the text editor to close (Enter → type → Escape). Connecting requires an arrow bound at both ends to two different shapes -- a stray unbound arrow, a one-sided bind, or a self-loop does not count. Starter/import labels and connections are baselined the same way as marks, so they don't auto-complete the hint. Save-state confirmation is still not implemented.
- **Not built yet:** the `save` hint, collaborator authorship beyond the baseline/mark-type exclusion, and analytics wiring for the five `QuickstartEventName`s:
  - Day 20 (Jason): analytics wiring for the five `QuickstartEventName`s, control/treatment comparison.

## Conventions

- Shared state uses Jotai atoms (`../app-jotai`), matching the rest of `excalidraw-app` (see `collabAPIAtom`, `shareDialogStateAtom`) — not React Context. Anything reading/writing the atoms outside React must go through `appJotaiStore`, the same store `<Provider>` mounts in `App.tsx`.
- `QuickstartEvent` must never carry drawing text, images, or scene contents (Day 20 P0, PRD §3). Metadata only.
- Eligibility stays on-device (`localStorage` + IndexedDB), not account-based — a returning guest who's never signed up must still read as not-new (PRD §1b).
