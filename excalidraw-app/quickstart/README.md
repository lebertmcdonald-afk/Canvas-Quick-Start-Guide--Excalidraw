# Canvas Quick-Start Guide

Feature module for the Canvas Quick-Start Guide (PRD v2 — see
[`/docs/Canvas Quick-Start Guide PRD.pdf`](../../docs/Canvas%20Quick-Start%20Guide%20PRD.pdf)
and
[`/docs/Canvas Quick-Start Guide - Feature Roadmap.pdf`](../../docs/Canvas%20Quick-Start%20Guide%20-%20Feature%20Roadmap.pdf)).
Everything the guide needs lives here so Days 15–20 don't collide on
shared app files.

| File | Owns | Day |
| --- | --- | --- |
| `useIsNewCanvasUser.ts` | Eligibility check (3 signals) | Day 15 — Lebert |
| `useQuickstartGuide.ts` | Guide behavior: opt-in, first hint, end-guide, exposure→seen-flag | Day 16 — Jason |
| `QuickstartGuide.tsx` | Prompt + hint UI | Day 15 (placeholder) → Day 16 (real content, this file) |
| `types.ts` | Shared types: hint IDs, experiment group, event names | infra |
| `state.ts` | Shared guide state (Jotai atoms) | infra |

## What's built vs. what's scaffolded

- **Day 15 (done):** eligibility check is real, wired into
  `excalidraw-app/App.tsx`.
- **Day 16 (done):** opt-in prompt is real (two working actions, not a
  placeholder); the first hint (`shape-tool`) shows once opted in and
  disappears on its own the moment the user draws a shape, detected via
  the existing `onChange` scene-change callback; the "end the guide"
  control actually suppresses further guide state; a user who never
  interacts with any of it still gets an unblocked, undelayed canvas
  (P0, re-verified) since `onChange` only *observes* scene changes after
  Excalidraw has already applied them -- it can't gate or slow drawing.
  `markGuideSeen()` now fires on exposure (first time the prompt is shown
  to a new user), not on completion -- see the comment on it in
  `useIsNewCanvasUser.ts` for why that distinction matters.
- **Not built yet:**
  - Day 17 (Abdoul): hardening, or the next hint (`labeling`) if Day 16 lands clean.
  - Day 18 (Mofazzal): full hint chain end-to-end (`HINT_SEQUENCE[1..3]`), user-authored vs. system/import/collaborator action detection, save-state confirmation.
  - Day 20 (Jason): analytics wiring for the five `QuickstartEventName`s, control/treatment comparison.

## Conventions

- Shared state uses Jotai atoms (`../app-jotai`), matching the rest of
  `excalidraw-app` (see `collabAPIAtom`, `shareDialogStateAtom`) — not
  React Context.
- `QuickstartEvent` must never carry drawing text, images, or scene
  contents (Day 20 P0, PRD §3). Metadata only.
- Eligibility stays on-device (`localStorage` + IndexedDB), not
  account-based — a returning guest who's never signed up must still read
  as not-new (PRD §1b).
