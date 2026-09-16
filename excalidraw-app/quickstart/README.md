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
| `QuickstartPromptPlaceholder.tsx` | Prompt UI | Day 15 (placeholder) → Day 16+ (real content) |
| `types.ts` | Shared types: hint IDs, experiment group, event names | infra |
| `state.ts` | Shared guide state (Jotai atoms) | infra |

## What's built vs. what's scaffolded

- **Day 15 (done):** eligibility check is real and wired into
  `excalidraw-app/App.tsx`; the prompt itself is an inert placeholder
  (`pointerEvents: none`, no handlers) so the Day 15 P0 — a user can start
  drawing without ever touching it — holds by construction.
- **Not built yet:** `state.ts`'s atoms are empty state slots — nothing
  sets or reads them yet. Behavior detection (has the user drawn a shape?
  labeled it? connected it?), real hint content, the "end the guide"
  control, save-state detection, and analytics wiring all still need to be
  written against these types by their owning day:
  - Day 16 (Jason): first real hint (`shape-tool`) + the "end the guide" control.
  - Day 17 (Abdoul): hardening, or the next hint (`labeling`) if Day 16 lands clean.
  - Day 18 (Mofazzal): full hint chain end-to-end, user-authored vs. system/import/collaborator action detection, save-state confirmation.
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
