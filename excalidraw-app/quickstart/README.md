# Canvas Quick-Start Guide

Feature module for the Canvas Quick-Start Guide (PRD v2 — see [`/docs/Canvas Quick-Start Guide PRD.pdf`](../../docs/Canvas%20Quick-Start%20Guide%20PRD.pdf) and [`/docs/Canvas Quick-Start Guide - Feature Roadmap.pdf`](../../docs/Canvas%20Quick-Start%20Guide%20-%20Feature%20Roadmap.pdf)). Everything the guide needs lives here so Days 15–20 don't collide on shared app files.

| File | Owns | Day |
| --- | --- | --- |
| `useIsNewCanvasUser.ts` | Eligibility check (3 signals) | Day 15 — Lebert |
| `QuickstartGuide.tsx` | Prompt + hint UI, opt-in, "end the guide" | Day 16 — Jason |
| `behavior.ts` | Pure logic: what counts as a user-authored mark, hint progression | Day 16 — Jason |
| `quickstartTracker.ts` | onChange hook point: detects the user's shape, completes the hint | Day 16 — Jason |
| `types.ts` | Shared types: hint IDs, experiment group, event names | infra |
| `state.ts` | Shared guide state (Jotai atoms) | infra |

## What's built vs. what's scaffolded

- **Day 15 (done):** eligibility check is real and wired into `excalidraw-app/App.tsx`. A browser is "new" only if it has no saved elements, no library items, and no seen-guide flag.
- **Day 16 (done):** the prompt is real. Opting in shows the first hint (`shape-tool`), which pulses the toolbar's shape buttons. When the user authors a shape themselves the hint completes on its own — it never repeats. Every screen (prompt and hint) carries an explicit **End guide** control that ends the whole guide and persists the seen-guide flag. `App.tsx`'s `onChange` feeds `trackQuickstartElements`, which skips all work unless the user opted in, so a user who ignores the prompt pays nothing (the P0 exit check both days protect — see `tests/quickstart.test.tsx`).
- **Not built yet:** the `labeling`, `connecting`, and `save` hints (add them to `IMPLEMENTED_HINTS` in `behavior.ts` plus a case in `QuickstartGuide`'s `HintBody`), user-authored vs. system/import/collaborator action detection, save-state confirmation, and analytics wiring for the five `QuickstartEventName`s:
  - Day 17 (Abdoul): hardening, or the `labeling` hint if Day 16 holds.
  - Day 18 (Mofazzal): full hint chain end-to-end, authorship detection, save-state confirmation.
  - Day 20 (Jason): analytics wiring, control/treatment comparison.

## Conventions

- Shared state uses Jotai atoms (`../app-jotai`), matching the rest of `excalidraw-app` (see `collabAPIAtom`, `shareDialogStateAtom`) — not React Context. Imperative writers (e.g. `quickstartTracker.ts`) go through `appJotaiStore`, the same store `<Provider>` mounts in `App.tsx`.
- `QuickstartEvent` must never carry drawing text, images, or scene contents (Day 20 P0, PRD §3). Metadata only.
- Eligibility stays on-device (`localStorage` + IndexedDB), not account-based — a returning guest who's never signed up must still read as not-new (PRD §1b).
