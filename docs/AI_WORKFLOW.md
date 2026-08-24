# Kinwin AI Workflow

How Claude/Codex sessions on this repository are expected to start, and finish, work.

## Repository state is the persistent memory

Neither Claude nor Codex retains memory between sessions. GitHub — commit history, merged PRs,
Actions run logs, and this repository's own documentation — is the only persistent record of what
has actually happened. A fresh session must treat that record as ground truth over its own
assumptions or over any single document's prose, including this one.

## Start of session

Before planning any new work, read `docs/AI_HANDOFF.md`. It is the short, current-state entry
point — what's shipped, what's verified, what must not be redone, and the current genuine
blocker(s). It links out to `docs/PRODUCT_STATUS.md` (full feature inventory) and
`docs/LAUNCH_READINESS.md` (full release-blocker audit) for detail.

If `docs/AI_HANDOFF.md` conflicts with primary evidence (git history, a merged PR, an Actions run
result, deployed migration state) — investigate and fix the documentation, rather than trusting the
stale text. Stale documentation is a defect to correct, not a fact to work around.

## End of task — before reporting complete

A task is not complete merely because code is committed or a workflow succeeded. Before reporting
a task finished, update `docs/AI_HANDOFF.md` if the task involved any of:

- a merged implementation PR (new feature, meaningful bugfix, architecture decision)
- a database deployment (migrations applied to a hosted project)
- a release/deployment action (EAS build, TestFlight/App Store submission, hosted verification)
- a newly discovered blocker
- resolution of a previously-recorded blocker
- a founder-confirmed correction to previously-recorded external state (e.g. Apple Developer
  Program status) — this must never silently regress to an older repository claim once corrected

Rules for that update:

- **Completed work must not remain listed as a blocker.** If a blocker is resolved, remove it from
  `docs/AI_HANDOFF.md`'s current-blocker section — do not leave stale blockers next to new ones.
- **Reconcile, don't duplicate.** If `docs/PRODUCT_STATUS.md` or `docs/LAUNCH_READINESS.md` contain
  a statement that now contradicts the handoff, fix that statement too. There must never be one
  document saying a thing is pending while another says it is done.
- **Keep `docs/AI_HANDOFF.md` short.** It represents current actionable truth, not a historical
  diary — a one-line pointer to the relevant PR/commit is enough; full narrative belongs in PR
  descriptions and commit messages, which git history already preserves permanently.
- A task that only reads/investigates and changes nothing does not need a handoff update.

## Reconciling documentation drift

When investigation surfaces a stale claim outside `docs/AI_HANDOFF.md` (a status table cell, a
narrative paragraph, a "blocked on X" line that X no longer supports), fix it in place rather than
adding a new correction note elsewhere. Leaving two documents in disagreement is the exact failure
mode this file exists to prevent.
