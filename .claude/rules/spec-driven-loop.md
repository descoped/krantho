# Spec-Driven Loop

## Contents

- What a spec loop is
- The human gate (the whole design)
- The three artifact homes (never conflate)
- The cycle
- Mandatory guards
- Isolation
- Krantho invariants bind every cycle
- Smell markers — fix on sight
- When this rule is not

The contract for long-horizon autonomous work (`/kt-spec-loop`, way-of-work mode 5). The
command owns the lifecycle mechanics; this rule owns the contract — the gates, the cycle,
the guards, and the isolation. Its isolation and merge provisions are hard guarantees
while a loop is active: a loop that pushes to master, opens per-cycle PRs, or merges a
goal PR before CI is green and its review findings are addressed is a defect, not a
trade-off.

## What a spec loop is

A goal too large to hold in one context, executed as fresh-context cycles bound by a
durable, developer-approved spec, each cycle gated by a blind independent verifier,
advancing autonomously until the spec's acceptance conditions are met — then one goal
PR, merged once CI and the automated review pass.

## The human gate (the whole design)

A loop has no oracle beyond its spec — give it a wrong spec and it will faithfully execute
the wrong thing to completion. The developer owns the one judgment a loop cannot make:
**spec validity, up front.** Design/scoping is interactive and ends at a hard confirm
gate. Nothing autonomous starts until the developer approves the locked spec.

Everything after that gate runs without human intervention, through to the merge. The
developer does not review PRs: each goal PR gets the automated review
(`.github/workflows/claude.yml`) on top of CI, the driver addresses its findings as direct
edits, and squash-merges once CI is green and every finding is addressed. Shipping is
separate — nothing reaches production until the developer explicitly approves a release
(`.claude/rules/releases.md`).

## The three artifact homes (never conflate)

| Layer | What | Home | Why there |
|-------|------|------|-----------|
| Target | goal + machine-checkable acceptance conditions | the GitHub issue | durable, visible everywhere; the goal PR closes it |
| Spec | the self-contained contract | `<notes directory>/issues/issue-N/design.md`, in the notes directory outside the repository | write-once, committed there when locked, re-read every cycle; the repository holds no working documents |
| Position | live state — done / in-flight / next / blocked, cycle count, budget, carry-forwards | `~/.krantho/loops/issue-N.json` | mutated every cycle; survives context resets and compaction; **never git-tracked** |

Keeping the position only in the conversation context is the failure mode this design
exists to prevent: one compaction and the loop forgets where it was. Out-of-band or
nothing.

## The cycle

Each cycle, in the loop's worktree:

1. **Re-read the spec + position.** Never trust memory of them — the faster the loop, the
   more it must return to the spec or it drifts inside its own momentum.
2. **Pick one slice** — the single most valuable unsatisfied acceptance condition. One
   concern per cycle bounds *risk*, not throughput: once a pattern is proven (same seam,
   same fixture style, same test discipline across several passed slices), **batch
   mechanically-similar conditions into one cycle** — every cycle carries real fixed
   overhead (skill + spec + position reads for two agents), and fine slicing past the
   point of risk isolation just multiplies it.
3. **Implement in a fresh context** (the `spec-loop-implementer` agent, at high effort,
   running the `spec-loop-implement` skill): bounded read-list, pre-decided structural
   home, no commit rights, spec gaps reported — never improvised.
4. **Verify with a blind, independent gate** (the `spec-loop-verify` skill): given only
   the spec + the diff, never the implementer's context or reasoning. Strict; partial =
   FAIL; the verifier judges, it does not fix. Rigour scales to slice risk:
   - **Single rigorous verifier** for a provably-leaf slice — doc/test-only changes, a
     type-only mirror the compiler already guards.
   - **Adversarial panel** (independent skeptics; the slice advances only if a majority
     fail to refute it) for genuine risk — an API contract change, persistence schema,
     auth, a cross-package seam, anything touching an invariant below.
   The floor never relaxes: it is never the implementer judging its own work.

   **Calibration decays with demonstrated yield.** Verification rigour is not static
   across the loop's life. Early cycles run the full gate — that is where the real
   defects surface (a panel caught a production-breaking wire-format bug precisely
   because the implementer's own tests were green against an unreal fixture). But track
   verifier yield in the position store: after several consecutive clean full verifies
   on pattern-following slices, the driver downshifts — driver-run area gates + a spot
   check per slice, and **one lean fidelity-only verifier per batch** (fixture vs the
   real handlers at HEAD — the axis that historically finds everything), with full blind
   verification reserved for genuinely novel risk (a new seam, auth, concurrency, a
   first-of-a-kind surface). Every protocol shift is recorded in the position store as a
   driver/operator directive. What never relaxes even in lean mode: real-handler
   grounding of fixtures, the area gate green before every commit, and the goal-PR
   whole-diff review.
5. **Advance or halt.** PASS → the driver commits the slice on the goal branch
   (one-concern conventional message, specific files staged), updates the position,
   advances. FAIL → retry the slice once; a second FAIL writes the blocker to the
   position store, sets `status: blocked`, escalates to the developer, and halts.

## Mandatory guards

A loop with no guards does not start:

- **Cycle cap** and **effort budget**, set in the position store at loop start.
- **Stuck-detection:** two failed attempts on one slice, or no position advance across
  consecutive cycles → escalate + halt. Never spin.
- **Spec gaps halt.** If a slice cannot be implemented as specified, the loop escalates —
  improvising past a wrong spec is how an autonomous loop ships the wrong thing
  efficiently.

## Isolation

- The loop lives in its own worktree (`.claude/worktrees/issue-N`) on branch
  `loop/issue-N-<slug>` cut from `origin/master`.
- **The only master contact is the goal PR.** No per-cycle PRs, no `/kt-start` ceremony
  inside the loop, no merge outside the goal gate — the loop's lifecycle is authoritative
  while it runs.
- **Sweep check each cycle:** the main checkout's working tree stays clean. A stalled or
  killed subagent can leak writes into the wrong checkout; the authoritative copy is the
  worktree's — revert tracked leaks, remove untracked ones.
- Repo git rules bind every cycle: stage specific files (never `git add .`), conventional
  commits, no AI attribution, never force-push.

## Krantho invariants bind every cycle

The spec names which apply; the verifier checks them. Autonomy never routes around:

- Persistence only via `IPersistenceAdapter` — no direct `fs` outside persistence packages.
- `@krantho/core` has zero UI framework imports.
- Code-defined Zod schemas are read-only; runtime fields are additive-only.
- Each package self-contained for npm publishing; cross-package imports via `@krantho/*`.
- Greenfield rules: no compatibility shims, no dead code, no placeholder stubs.
- Examples stay in parity with `examples/nextjs-shadcn`.
- The per-area gates in `way-of-work.md` — a slice is not handed back red.

## Smell markers — fix on sight

- A loop pushing to master, opening a per-cycle PR, or merging a goal PR with CI red or
  review findings unaddressed.
- Loop code sitting uncommitted in the main checkout's working tree.
- The live position living in design.md or any git-tracked file.
- A verifier sharing the implementer's context, or suggesting fixes instead of judging.
- A loop with no cycle cap, budget, or stuck-detection.
- A cycle expanding past its one slice instead of advancing and taking the next.
- Autonomous cycles starting before the developer confirmed the locked spec.
- Carrying loop machinery (fresh-context implementer + verify panel) into the post-PR
  review-response — that is mode-2 direct editing (`way-of-work.md`, down-shift).

## When this rule is not

- Work that fits one pass or one parallel burst — that is mode 3 or 4; reaching for a
  loop on a tractable task is over-ceremony.
- The design/scope phase itself — interactive collaboration; autonomy starts only after
  the confirm gate.
- Explicit developer override in the current session — an operator scope-cut, not a
  violation.
