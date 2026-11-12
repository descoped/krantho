---
name: spec-loop-design
description: Locks the spec for a long-horizon autonomous spec loop — a GitHub issue with machine-checkable acceptance conditions plus a self-contained, HEAD-verified design.md the loop re-reads every cycle. Use in /kt-spec-loop Phase 1, or whenever scoping a goal that will run autonomously. Trigger for "scope this as a spec loop", "lock the spec", the design phase of /kt-spec-loop.
---

# spec-loop-design — lock the spec a loop will run on

The spec is the only thing standing between an efficient autonomous loop and an
efficiently-wrong one. A loop has no oracle beyond it, so the design phase is interactive
and its output must be good enough that the loop runs many cycles with the developer out
of the loop. Quality here IS the loop's drift-resistance.

Governed by `.claude/rules/spec-driven-loop.md` (the three artifact homes).

## Produce two artifacts, in two homes

1. **The target → a GitHub issue.** The goal plus **machine-checkable acceptance
   conditions** — the loop's exit test. Each must be observable: a named vitest test
   passes, an endpoint returns a specified shape, a CLI command produces specified
   output, a Studio screen state is verifiable via Playwright, `go test ./...` passes in
   `cli/`. "Improve X" is not an acceptance condition.
2. **The spec → `<notes directory>/issues/issue-<N>/design.md`**, in the notes directory
   outside the repository. Self-contained: every package
   path, module, export, and signature verified against HEAD via `Read` in this session —
   never from memory. Captures the analysis, the decisions, and the anchors the cycles
   work against.

## Make the conditions sliceable

The loop advances one slice per cycle. Decompose the goal into conditions that are each
**one concern, independently checkable**. A condition only verifiable after three others
land is mis-sliced — fold it in or split it. A good acceptance list reads as the loop's
cycle plan.

## What "good enough to run autonomously" means

Before the confirm gate, the spec answers, without the developer present:

- **What "done" is** — the conditions, observable.
- **Where each slice lives — pre-decided.** Which package, which module, which existing
  pattern to mirror, HEAD-anchored. A fresh-context implementer that must decide "which
  package?" mid-cycle stalls; pre-deciding placement is what lets it read a short list
  and go straight to code.
- **What is out of scope** — the boundary that stops scope-creep.
- **Which invariants bind** — named from `spec-driven-loop.md`'s list, so the verifier
  can check them.
- **The known risks** — an unresolved real decision is a spec gap; resolve it at the
  confirm gate, never mid-loop.

## Hand-off

Surface the locked spec (issue + design.md) for the Phase 2 confirm gate. Do not create
the worktree, do not write code. Only explicit approval advances.
