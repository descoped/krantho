---
description: "Runs a goal too large for one context as an autonomous spec-driven loop — interactive design, a confirm gate on the locked spec, fresh-context implement and blind verify cycles, then one goal PR, merged once CI and the automated review pass. Use only after the developer opts in."
argument-hint: "<issue-number | feature description>"
---

# Spec Loop $ARGUMENTS

## Contents

- Configuration
- Phase 1 — Design / scope (interactive)
- Phase 2 — Confirm gate (hard stop)
- Phase 3 — Loop setup
- Phase 4 — Autonomous cycles — Per-slice area gates
- Phase 5 — Goal gate (review-gated) — Between goal gates (squash-merge mechanics)
- Phase 6 — Close
- Rules

Run a goal too large for one context as an autonomous, spec-driven loop: an interactive
design phase locks the spec, then fresh-context cycles implement → verify → commit →
advance with no per-cycle human intervention, until the spec's acceptance conditions are
met — then one goal PR, merged once CI and the automated review pass.

**This command enacts the contract in `.claude/rules/spec-driven-loop.md`. Read that rule
before running — it owns the gates, the guards, and the isolation. This file owns the
mechanics.**

**Usage:** `/kt-spec-loop <feature description>` (scope a fresh goal) or
`/kt-spec-loop <N>` (resume or run an already-scoped issue).

## Configuration

```
Repo: descoped/krantho
Main branch: main
Position store: ~/.krantho/loops/issue-<N>.json   (out-of-band, NEVER git-tracked)
Goal worktree:  .claude/worktrees/issue-<N>
Goal branch:    loop/issue-<N>-<slug>
```

## Phase 1 — Design / scope (interactive)

Produce the durable spec with the developer in the loop. Use the **`spec-loop-design`**
skill.

- **Target** → a GitHub issue (`gh issue create`) carrying the goal and
  **machine-checkable acceptance conditions** — the loop's exit test; observable, never
  aspirational. Human-readable title, no process markers.
- **Spec** → `<notes directory>/issues/issue-<N>/design.md`, in the notes directory outside the
  repository — self-contained, every path and
  signature verified against HEAD in this session. This is the contract the loop re-reads
  every cycle; its quality is the loop's drift-resistance.

No worktree, no code in this phase.

## Phase 2 — Confirm gate (hard stop)

Present the locked spec (issue + design.md) and **stop**. Only an explicit approval
advances to Phase 3. A revision request loops back to Phase 1. This is the spec-validity
judgment the loop cannot self-make.

## Phase 3 — Loop setup

On approval:

1. Worktree + branch: `git worktree add .claude/worktrees/issue-<N> -b loop/issue-<N>-<slug> origin/main`,
   then `EnterWorktree` with the absolute `path` `<repository root>/.claude/worktrees/issue-<N>`
   so the session works inside it. Enter it straight after `git worktree add`, before any `cd`
   into it: a `cd` already moves the session there, and a relative `path` then resolves to a
   nested folder that does not exist and asks for a permission prompt.
2. Lock the spec where it lives: commit `issues/issue-<N>/design.md` in the notes directory's own
   repository (`git -C <notes directory> commit`). Nothing about the spec is committed to this repository.
3. Initialize the position store `~/.krantho/loops/issue-<N>.json`:

```json
{
  "issue": 0,
  "branch": "loop/issue-0-slug",
  "worktree": ".claude/worktrees/issue-0",
  "status": "running",
  "cycle": 0,
  "cycleCap": 20,
  "budgetNote": "<developer-set effort bound>",
  "conditions": [
    { "id": "AC1", "text": "...", "status": "pending", "cycles": [] }
  ],
  "carryForwards": [],
  "log": []
}
```

`status` values: `running | blocked | awaiting-review | done`. Condition `status`:
`pending | done | blocked`.

## Phase 4 — Autonomous cycles

Loop until every acceptance condition is `done` OR a guard trips. Each cycle, in the goal
worktree:

1. **Read the contract** — `issue-<N>/design.md` + the position store. Never from memory.
2. **Pick one slice** — the most valuable `pending` condition.
3. **Implement** — spawn a fresh-context **`spec-loop-implementer`** agent (high effort),
   which runs the **`spec-loop-implement`** skill. Hand it: the slice's pre-decided
   structural home (from the spec), a bounded read-list, and "read these, then implement
   immediately — do not over-investigate."
   It implements only that slice, runs the slice's area gate (below), and returns the
   diff. It never commits.
4. **Verify** — spawn an independent gate with the **`spec-loop-verify`** skill, given
   only the spec + the diff. Single verifier for a provably-leaf slice; adversarial panel
   for genuine risk (API contract, persistence schema, auth, cross-package seam,
   invariant). Strict; partial = FAIL. Latent out-of-slice observations → carry-forwards
   in the position store, never a FAIL.
5. **Advance or halt** — PASS → commit on the goal branch (one-concern message, specific
   files), mark the condition, `cycle += 1`. FAIL → retry once; second FAIL → record
   blocker, `status: blocked`, escalate, halt.
6. **Guards every cycle** — cycle cap, budget, no-progress stuck-detection → escalate +
   halt. Sweep the main checkout for leaked writes.
7. **Calibrate as yield decays** — per `spec-driven-loop.md`: batch pattern-following
   conditions into single cycles, downshift to driver-run gates + one lean fidelity
   verifier per batch after consecutive clean full verifies, keep full blind verify for
   novel risk. Record every shift in the position store.

Pace with `/loop` (self-paced) or ScheduleWakeup when waiting on external state.

### Per-slice area gates

| Slice touches | Gate before hand-back |
|---------------|----------------------|
| TS packages | affected-package tests + **workspace-wide `pnpm run typecheck`** |
| Studio | TS gate + Playwright on the changed screens (the `/kt-qa` approach) |
| Examples | changed example builds + parity with `examples/nextjs-shadcn` |
| Go (`cli/`) | `gofmt -l .` empty, `go vet ./...`, `go build ./...`, `go test ./...` |

Before each **commit** (driver, on PASS): the area gates for touched areas. The full TS
pipeline runs at each goal gate — for pure-Go/docs slices it provably cannot change
outcome per commit (`cli/` is outside the workspace graph). In a **fresh worktree** the
TS pipeline must run `build` before `typecheck` (cross-package `dist/` type declarations
do not exist yet), and better-sqlite3 needs its native rebuild (see CLAUDE.md Testing
Requirements).

## Phase 5 — Goal gate (review-gated)

When the acceptance conditions are satisfied:

1. Push the goal branch and open **one** PR (`fixes #<N>`). For an explicitly phased goal,
   one PR per completed group of conditions (`Part of #<N>`), final group `fixes #<N>`.
2. Set position `status: awaiting-review`. Post the cycle log (slice → verdict → commit
   per cycle) as a PR comment.
3. Wait for the automated review (`.github/workflows/claude.yml`) to post. Address CI +
   review findings as **direct edits** (down-shift — no fresh panel), push, and comment
   the finding → fix mapping on the PR.
4. Merge once CI is green and every finding is addressed:
   `gh pr merge <PR> --repo descoped/krantho --squash --delete-branch` → Phase 6 (or the
   next group). A finding that shows the spec itself was wrong is not a direct edit: halt,
   set `status: blocked`, and escalate to the developer.

### Between goal gates (squash-merge mechanics)

- While a goal PR is open, **never push to the goal branch** — a push grows the open PR.
  Cycles may continue locally in the worktree; the commits push at the next gate.
- After a non-final goal PR squash-merges: `git -C <worktree> fetch origin && git reset
  --hard origin/main` (the group's content is preserved in main via the squash),
  delete the remote goal branch, and re-push it at the next gate — this keeps every goal
  PR's diff scoped to its own group. Tick the merged group's checkboxes on the issue.

## Phase 6 — Close

After the final merge: tick the issue's checkboxes to delivered reality (per `/kt-start` Phase 8;
the spec stays in the notes directory), leave the worktree (`ExitWorktree` with `keep`), remove it
(`git worktree remove .claude/worktrees/issue-<N>`, then delete the local goal branch), set position `status: done`. Post-merge
comments on the PR and issue per the git-workflow rules.

## Rules

- Isolation, gates, and guards per `.claude/rules/spec-driven-loop.md` — non-negotiable.
- The position store is never git-tracked.
- The verifier is blind and independent — never the implementer judging itself.
- No AI attribution in commits; stage specific files, never `git add .`.
