# Canvas Quick-Start Guide

Feature module for the Canvas Quick-Start Guide (PRD v2 — see [`/docs/Canvas Quick-Start Guide PRD.pdf`](../../docs/Canvas%20Quick-Start%20Guide%20PRD.pdf) and [`/docs/Canvas Quick-Start Guide - Feature Roadmap.pdf`](../../docs/Canvas%20Quick-Start%20Guide%20-%20Feature%20Roadmap.pdf)). Everything the guide needs lives here so Days 15–20 don't collide on shared app files.

| File | Owns | Day |
| --- | --- | --- |
| `useIsNewCanvasUser.ts` | Eligibility check (3 signals) | Day 15 — Lebert |
| `useQuickstartGuide.ts` | Guide behavior: opt-in, first hint, end-guide, exposure→seen-flag, scene detection | Day 16 — Jason |
| `QuickstartGuide.tsx` | Prompt + hint UI (incl. the shape-tool toolbar highlight) | Day 16 — Jason |
| `behavior.ts` | Pure logic: what counts as a user-authored mark, hint progression | Day 16 — Jason |
| `types.ts` | Shared types: hint IDs, experiment group, event names | infra |
| `state.ts` | Shared guide state (Jotai atoms) | infra |

## What's built vs. what's scaffolded

- **Day 15 (done):** eligibility check is real and wired into `excalidraw-app/App.tsx`. A browser is "new" only if it has no saved elements, no library items, and no seen-guide flag.
- **Day 16 (done):** opt-in prompt is real (two working actions, not a placeholder); the first hint (`shape-tool`) shows once opted in — with a pulsing highlight on the toolbar's shape buttons — and disappears on its own the moment the user authors a shape themselves, detected via the existing `onChange` scene-change callback; the "end the guide" control actually suppresses further guide state; a user who never interacts with any of it still gets an unblocked, undelayed canvas (P0, re-verified — see `tests/quickstart.test.tsx`) since `onChange` only _observes_ scene changes after Excalidraw has already applied them -- it can't gate or slow drawing. `markGuideSeen()` fires on exposure (first time the prompt is shown to a new user), not on completion -- see the comment on it in `useIsNewCanvasUser.ts` for why that distinction matters.

  Two detection rules, deliberately different (both in `useQuickstartGuide.notifySceneChange`, logic in `behavior.ts`):

  - **Prompt-clear (PRD P1):** a user who never opted in gets the prompt out of the way on their first canvas interaction — any content counts.
  - **Hint completion (PRD P0):** mark-based. Only elements the user authored themselves (shapes, arrows, lines, freedraw, text — not images/imports, per PRD §3) complete the hint, and only once; elements that predate opting in are baselined, not counted.

- **Not built yet:** the `labeling`, `connecting`, and `save` hints (add the id to `IMPLEMENTED_HINTS` in `behavior.ts` plus rendering in `QuickstartGuide.tsx`, and the chain advances automatically), collaborator/import authorship beyond the mark-type exclusion, save-state confirmation, and analytics wiring for the five `QuickstartEventName`s:
  - Day 17 (Abdoul): hardening, or the next hint (`labeling`) if Day 16 lands clean.
  - Day 18 (Mofazzal): full hint chain end-to-end (`HINT_SEQUENCE[1..3]`), user-authored vs. system/import/collaborator action detection, save-state confirmation.
  - Day 20 (Jason): analytics wiring for the five `QuickstartEventName`s, control/treatment comparison.

## Conventions

- Shared state uses Jotai atoms (`../app-jotai`), matching the rest of `excalidraw-app` (see `collabAPIAtom`, `shareDialogStateAtom`) — not React Context. Anything reading/writing the atoms outside React must go through `appJotaiStore`, the same store `<Provider>` mounts in `App.tsx`.
- `QuickstartEvent` must never carry drawing text, images, or scene contents (Day 20 P0, PRD §3). Metadata only.
- Eligibility stays on-device (`localStorage` + IndexedDB), not account-based — a returning guest who's never signed up must still read as not-new (PRD §1b).
