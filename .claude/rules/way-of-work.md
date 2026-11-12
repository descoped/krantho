# Way of Work

How process scales to the work on krantho. A ladder of modes along three axes:
codebase-touch + size picks the notes/lean/tracked modes, complexity/breadth picks
orchestration, horizon picks the long-horizon loop.

## The ladder

1. **Working documents.** Design and task documents, analyses and plans are written to the
   notes directory outside the repository (`CLAUDE.md`, Documentation Conventions) and are
   never committed here. Everything in the repository — code, `docs/`, `.claude/rules/`,
   `CLAUDE.md` — goes through a branch + PR. Nothing is committed directly to master.
2. **Lean fix.** An in-session code change whose scope is known — asked for by the
   developer, or found in the session (a review or audit finding, a bug traced to its
   code): branch → fix → full TS pipeline → PR → CI + automated review → **merge**. No
   issue, no design.md/task.md ceremony.
3. **Tracked issue.** `/kt-start N` — the full pipeline: branch, design.md + task.md,
   implement, verify, PR, automated review, merge, post-merge issue update. `/kt-issue` files
   the issue first. `/kt-pipeline` runs a batch of small pre-designed issues through this
   mode sequentially, each through to its merge.
4. **Multi-agent orchestration.** ultracode / Workflow / `/loop` — for breadth beyond one
   context (repo-wide audit or migration), unknown-size discovery (find all the bugs),
   correctness-critical assurance, or a wide design space. **Propose it and wait for the
   developer's go — never auto-run.** It composes modes 2–3: results still land as reviewed
   PRs; in-workflow adversarial verification is extra assurance, never a replacement for
   CI + the automated review.
5. **Long-horizon loop.** `/kt-spec-loop N` — a goal too large to hold in one context,
   carried across context resets by a locked, developer-approved spec. Autonomous after
   its one human gate, the spec confirm, through to the goal PR's merge. Full contract:
   `.claude/rules/spec-driven-loop.md`. **Propose it; developer opt-in to start.**

## Selection discipline

- **Operator words win.** An explicit command or instruction picks the mode. When the pick
  was ambiguous, say which mode was taken.
- **A PR, not an issue.** Known-scope work is fixed and opened as a PR, related fixes in
  one area sharing one. Issues only on the developer's request or as a spec loop's target.
- **Climb tests.** Fits one careful pass → mode 2 or 3. Would parallel agents plus
  adversarial verification materially beat one pass → propose mode 4. Too long-horizon for
  one context, needs a durable spec across resets → propose mode 5.
- **Down-shift between phases.** Re-evaluate the mode at each phase; never inherit the
  previous phase's machinery. Addressing review findings after a mode-4/5 burst is mode-2
  direct editing — pre-specified findings are edits, not investigations, and their count
  never justifies orchestration.
- **Merges are review-gated, not operator-gated.** The developer does not review PRs.
  Every PR gets the automated review (`.github/workflows/claude.yml`); Claude addresses its
  findings and squash-merges once CI is green (`.claude/rules/git-workflow.md`). Push only
  on explicit request — and invoking a pipeline command (`/kt-start`, `/kt-pipeline`,
  `/kt-spec-loop`) *is* that request for its own run's pushes and merges, so those commands
  run unattended through the merge.
- **Nothing goes out the door without the developer's explicit approval.** A release
  (`/kt-release`, `.claude/rules/releases.md`) runs only on the developer's instruction,
  which is also the go for its own version PR's merge. Never commit directly to master.

## Per-area quality gates

Every mode runs the gate for the areas its diff touches. The loop (mode 5) binds these
per slice; modes 2–3 run them before the PR.

| Area | Gate |
|------|------|
| TS packages (`packages/`, `krantho-site/`) | `pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run test:run && pnpm run build` — Docker must be running (postgres testcontainers). Per-package checks are blind to downstream consumers: always include the workspace-wide `pnpm run typecheck`. |
| Studio (`packages/studio`) | the TS gate, plus Playwright verification of the changed screens (the `/kt-qa` approach: build Studio, serve, drive the affected screens). |
| Examples (`examples/`) | the changed example builds; **parity** — `examples/nextjs-shadcn` (port 4002) is the reference; a change there is mirrored to the other examples in the same unit of work or explicitly tracked as a follow-up. |
| Go components (`cli/`) | from the module root: `gofmt -l .` prints nothing, `go vet ./...`, `go build ./...`, `go test ./...` all exit 0. |

### Go area

The krantho CLI is a Go tool living at `cli/` — its own `go.mod` (module
`github.com/descoped/krantho/cli`), **outside the pnpm workspace**. Standard Go layout: `cli/cmd/krantho/main.go`, packages under `cli/internal/`,
table-driven tests, no CGO unless a spec says otherwise. Go code lands with the same
mode discipline and gates as TS packages.
