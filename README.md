# Canvas Quick-Start Guide

An optional, behavior-based onboarding feature for Excalidraw, built as a product/engineering exercise targeting first-session activation.

## The problem

New signups may struggle to translate their intended task into an initial, useful canvas action, even though Excalidraw already ships a welcome screen with quick actions and interface hints. This is a working hypothesis, not a confirmed finding. We don't yet have Excalidraw's internal funnel data confirming how many users this affects or which specific step they get stuck on.

It's still the highest-leverage place to focus, per the Head of Product's brief: it happens in the very first moments of a user's first visit, sits upstream of every other product metric, and is directly observable in session data.

## What this is, and what it isn't

The Canvas Quick-Start Guide is a small, dismissible prompt that offers one relevant piece of help based on what a user actually does on the canvas. It is not a fixed, auto-advancing tutorial.

- A first-time user sees a small prompt on landing, never a blocking modal.
- If they ignore it and start drawing on their own, it gets out of the way immediately.
- If they opt in, the guide offers one relevant hint at a time based on their most recent action (shape tool, labeling, connecting, saving), and every hint disappears once they've done it themselves.
- Every step has an explicit, visible way to end the guide entirely.

## Who sees it

Eligibility is based on genuine first use, checked on-device, not account status. Before showing the guide, we check whether the browser already holds Excalidraw data, a past drawing, saved library items, or a flag from having seen the guide before. If either signal is present, the guide is skipped, so experienced guests never see a first-timer experience.

New collaborators joining an existing shared canvas are treated as a separate population and are out of scope for this MVP.

## Success metrics

Primary metric: first-session activation rate, as defined by the Head of Product (percentage of new signups who complete and save a first drawing within their first session).

We're also tracking, as diagnostics rather than success targets:

- First user-authored action
- Pre-creation abandonment
- Friction added by the guide itself (time and steps before drawing, for both guided and unguided users)
- Reliability failures, so a bug isn't mistaken for confusion
- Follow-through in the days after first use

Quick-Start exposure and opt-in are diagnostics, not goals. A user who ignores it and succeeds anyway is not a failure.

## Build roadmap

This is being built and sequenced across a short build window. Full day-by-day milestones, risks, and scope cuts live in the team's Feature Roadmap doc (internal, linked in project management, not duplicated here since it changes as we build).

High-level sequence:

1. **Eligibility check** — reliably tell a genuinely new browser from an existing user, before anything else gets built on top of it.
2. **First real hint** — one behavior-based hint responds to a real user action, with a working "end the guide" control.
3. **Full behavior chain** — all hints work end to end, system correctly distinguishes user-authored actions from starter content, imports, and remote edits, and save-state confirmation is accurate.
4. **Analytics and demo readiness** — event tracking is accurate for both control and treatment groups, and lower-priority items are cut if anything is still at risk.

## Explicitly out of scope for this build

- A mandatory or auto-advancing walkthrough
- A comprehensive tutorial covering every Excalidraw feature
- Personalized or role-based guidance paths
- Collaborator-specific onboarding (scoped as a separate, later initiative)

## Open questions

- What exact threshold defines "complete and save a first drawing," and which surface (free editor local storage vs. Plus cloud) counts?
- What percentage of new signups currently fail at the specific step this feature targets?
- Which session-reset interpretation (user-level, attempt-level, or later activation) is the official reporting metric?

All numeric targets referenced in planning docs are placeholders pending real baseline data, not measured findings.
