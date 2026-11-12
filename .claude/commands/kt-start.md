---
description: "Takes a krantho issue from branch to merged PR — design.md and task.md, implementation, verification, PR, review fixes, the merge and the post-merge issue update. Use to start work on a tracked issue."
argument-hint: "<issue-number>"
---

# Start Issue Work

## Contents

- Configuration — Workspace Areas
- Phase 1: Fetch and Analyze Issue
- Phase 2: Setup
- Phase 3: Implementation
- Phase 4: Verify
- Phase 5: Commit and PR
- Phase 6: Post-PR
- Phase 7: Review and Fix
- Phase 8: Post-Merge — Step 1: Update issue body with completed state, Step 2: Verify issue body, Step 3: Leave the documents where they are
- Phase 9: Post-Merge Follow-ups
- Rules

Full issue-to-PR workflow for krantho. Takes an issue number as argument: `/kt-start 42`

## Configuration

```
Repo: descoped/krantho
Main branch: master
```

### Workspace Areas

| Area | Packages |
|------|----------|
| core | `packages/core/` |
| persistence | `packages/persistence*/` |
| schema | `packages/schema/` |
| api | `packages/api/` |
| server | `packages/server/`, `packages/server-*/` |
| studio | `packages/studio/` |
| ui | `packages/ui-*/` (parallel alternatives) |
| ai | `packages/ai/` |
| seo | `packages/seo/`, `packages/seo-shared/` |
| media | `packages/media-local/` |
| tools | `packages/tools/` |
| bundles | `packages/next/`, `packages/node/`, `packages/sveltekit/` (one-install meta-packages) |
| scaffolder | `packages/create-krantho/` |
| examples | `examples/` (parity reference: `examples/nextjs-shadcn`) |

Checks: `pnpm --filter @krantho/<name> run typecheck` for the touched package, and always the workspace-wide `pnpm run typecheck` (per-package checks are blind to downstream consumers).

## Phase 1: Fetch and Analyze Issue

```bash
gh issue view $ARGUMENTS --repo descoped/krantho
```

Read ALL referenced documents. Understand the full scope before proceeding.

## Phase 2: Setup

1. Assign issue: `gh issue edit $ARGUMENTS --repo descoped/krantho --add-assignee @me`
2. Create branch:
   - Features: `feature/issue-N-short-description`
   - Bugs: `fix/issue-N-short-description`
   - Docs: `docs/issue-N-short-description`
   - Refactoring: `refactor/issue-N-short-description`
3. Create `mkdir -p <notes directory>/issues/issue-N` (the notes directory, outside the repository)
4. Create **design.md** — fully self-contained, copy all specs verbatim
5. Create **task.md** — checkbox tasks, files to modify, acceptance criteria

## Phase 3: Implementation

Work through task.md, check off tasks as completed. Implementation order: Core → Persistence → Schema → Adapters → Components → Tools.

## Phase 4: Verify

- Check acceptance criteria from issue
- Run all checks: `pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run test:run`
- On a green gate, continue straight to Phase 5 — do **not** stop for confirmation. Invoking `/kt-start` authorizes the full issue→merge pipeline; the developer does not review PRs. Escalate only on a gate failure or a genuine spec ambiguity.

## Phase 5: Commit and PR

- Stage specific files (never `git add .`)
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Push: `git push -u origin BRANCH`
- Create PR:

```bash
gh pr create --repo descoped/krantho --title "TITLE" --body "BODY" --label "LABELS"
```

PR body must include: summary, `fixes #N`, task file link, area checkboxes, changes, testing checklist.

**After PR creation**: comment on the issue linking the PR:
```bash
gh issue comment N --repo descoped/krantho --body "PR created: #PR_NUMBER"
```

## Phase 6: Post-PR

- Run tests and post results as PR comment
- Update issue body: mark checkboxes, add design doc link

## Phase 7: Review and Fix

When review comments are received (from Claude Code Review action, user, or `/kt-review`):

1. Read all review comments
2. Fix all findings — critical, suggestions, and minor
3. Commit fixes: `fix: address review — DESCRIPTION`
4. Run verification: `pnpm run format:check && pnpm run typecheck && pnpm run test:run`
5. Push
6. **Comment on PR** with a summary of all fixes (table format: finding → fix)
7. If review spawns follow-up discussion, repeat this phase

**Every push to a PR branch is followed by a PR comment documenting what was pushed.**

### Merge

Wait for the automated review (`.github/workflows/claude.yml`) to post before treating the
PR as reviewed — no comment yet means the review has not run, not that it found nothing.
Once CI is green and every finding is addressed:

```bash
gh pr merge PR_NUMBER --repo descoped/krantho --squash --delete-branch
```

## Phase 8: Post-Merge

Run every step after every merge: a closed issue with open checkboxes misleads anyone reading the tracker later.

### Step 1: Update issue body with completed state

Update the GitHub issue body to its final state:

1. **Mark ALL Tasks checkboxes as completed** — change `- [ ]` to `- [x]` in the Tasks section
2. **Mark ALL Acceptance Criteria checkboxes as completed** — change `- [ ]` to `- [x]` in the AC section

Use `gh issue edit N --repo descoped/krantho --body "UPDATED_BODY"` to update the issue.

Read the current issue body first with `gh issue view N --repo descoped/krantho --json body -q .body`, then modify it; a body reconstructed from memory drops content.

### Step 2: Verify issue body

```bash
# Must return empty — no unchecked boxes allowed
gh issue view N --repo descoped/krantho --json body -q '.body' | grep '\- \[ \]'
```

If it prints anything, fix the issue body with `gh issue edit` and re-verify.

### Step 3: Leave the documents where they are

`design.md` and `task.md` stay in the notes directory after the merge. Nothing is archived, nothing
about them is committed to the repository, and the issue does not link to them: the notes directory
is private.

## Phase 9: Post-Merge Follow-ups

When bugs or issues are found after merge that relate to the same issue:

1. Fix on master (or a new branch if non-trivial)
2. Commit with `refs #N` in the message
3. Push
4. **Comment on the PR** documenting the follow-up fix
5. **Comment on the issue** documenting the follow-up fix

**Every commit that references an issue is documented with a comment on that issue.**

## Rules

- No AI attribution in commits
- Working directory stays at project root
- Stage specific files, never `git add .`
- Conventional commit format
- design.md and task.md are required for every issue
- Post-merge issue update is required — closed issues carry no unchecked boxes
- **Every push gets a comment** — PR branch pushes → PR comment; master pushes referencing issues → issue comment + PR comment
- **Runs unattended through the merge** — a green gate proceeds to commit + PR with no confirmation stop; the PR merges once CI is green and the automated review's findings are addressed. Escalate only on a gate failure or genuine ambiguity.
