---
description: "Runs a range of pre-designed issues through the /kt-start pipeline one after another, each through the automated review to its merge. Use for a batch of small issues."
argument-hint: "<range: 27-38 | 27,29,31>"
---

# Issue Pipeline $ARGUMENTS

## Contents

- Configuration
- Argument Parsing
- Pre-Flight Check
- Per-Issue Cycle — Step 1: Implement (kt-start Phase 1-3), Step 2: Local Code Review, Step 3: Commit, Push, and Create PR, Step 4: Wait for CI and Fix, Step 5: Address GitHub Review Comments, Step 6: Merge, Step 7: Post-Merge Cleanup (kt-start Phase 8), Step 8: Progress Report
- Error Handling — Recoverable Errors, Pipeline Abort Conditions
- Rules

Sequential implementation of a range of issues. Each issue runs unattended through its PR — implements, reviews, fixes, merges, and continues with the next.

**Usage**: `/kt-pipeline 27-38` or `/kt-pipeline 27,29,31`

## Configuration

```
Repo: descoped/krantho
Main branch: master
```

## Argument Parsing

`$ARGUMENTS` can be:
- A range: `27-38` → issues 27, 28, 29, ..., 38
- A comma-separated list: `27,29,31` → issues 27, 29, 31
- A single issue: `27` → just issue 27

Parse the argument and build the ordered issue list.

## Pre-Flight Check

Before starting the pipeline:

1. **Verify on master**: `git branch --show-current` must be `master`
2. **Clean working tree**: `git status` must show no uncommitted changes (untracked files OK)
3. **Pull latest**: `git pull origin master`
4. **Verify all issues exist and are open**:
   ```bash
   gh issue view N --repo descoped/krantho --json state -q .state
   ```
   Skip closed issues with a note. Abort if an issue doesn't exist.
5. **Verify design docs exist**: Each issue must have `<notes directory>/issues/issue-N/design.md`
6. **Print pipeline plan**:
   ```
   Pipeline: #27 → #28 → #29 → ... → #38
   Issues: 12 total, 12 open, 0 skipped
   Starting...
   ```

## Per-Issue Cycle

For each issue N in the list, execute this complete cycle:

### Step 1: Implement (kt-start Phase 1-3)

1. Read the issue: `gh issue view N --repo descoped/krantho`
2. Read the design doc: `<notes directory>/issues/issue-N/design.md`
3. Assign: `gh issue edit N --repo descoped/krantho --add-assignee @me`
4. Create branch from master: `feature/issue-N-short-description`
5. Create/verify `task.md` in `<notes directory>/issues/issue-N/`
6. Implement all tasks from the design doc
7. Run verification: `pnpm run format:check && pnpm run typecheck && pnpm run test:run && pnpm run build`
8. Fix any failures — do NOT proceed with broken code

### Step 2: Local Code Review

Run a clean code review on ALL packages that changed:

1. Determine which packages were modified (from git diff)
2. For each modified package, perform the full `/kt-code-review` analysis
3. **Fix ALL findings** — critical, refactor, AND minor. No findings carried forward.
4. Run verification again after fixes
5. Commit fixes as a separate commit: `refactor: fix code review findings for #N`

### Step 3: Commit, Push, and Create PR

1. Stage specific files (never `git add .`)
2. Commit with conventional format: `feat:`, `fix:`, `refactor:`, etc.
3. Push: `git push -u origin BRANCH`
4. Create PR:
   ```bash
   gh pr create --repo descoped/krantho --title "TITLE" --body "BODY"
   ```
5. Post a comment on the PR summarizing implementation + review fixes

### Step 4: Wait for CI and Fix

1. Watch CI: `gh pr checks PR_NUMBER --repo descoped/krantho --watch`
2. If CI fails:
   - Read the failing check output
   - Fix the issue locally
   - Commit, push, watch CI again
   - Repeat until all checks pass (max 3 attempts, then abort pipeline with error)
3. If CI passes: continue

### Step 5: Address GitHub Review Comments

1. Wait for the automated review (`.github/workflows/claude.yml`) to post — no comment yet
   means the review has not run, not that it found nothing. Then read its comments:
   ```bash
   gh api repos/descoped/krantho/pulls/PR_NUMBER/reviews
   gh api repos/descoped/krantho/pulls/PR_NUMBER/comments
   ```
2. If there are review comments:
   - Read each comment carefully
   - Fix ALL findings — including warnings, suggestions, and nits
   - Commit each fix: `fix: address review — DESCRIPTION`
   - Push and wait for CI again
   - Post a response comment listing all changes
3. If no review comments: continue

### Step 6: Merge

1. Verify all CI checks pass and every review comment is addressed
2. Squash-merge: `gh pr merge PR_NUMBER --repo descoped/krantho --squash --delete-branch`

### Step 7: Post-Merge Cleanup (kt-start Phase 8)

1. Confirm the merge: `gh pr view PR_NUMBER --repo descoped/krantho --json state -q .state` must print `MERGED`
2. Switch to master: `git checkout master && git pull origin master`
3. Update issue body: mark all checkboxes as `[x]`
4. Verify issue body: no unchecked boxes
5. The design and task documents stay where they are, in the notes directory; nothing is archived

### Step 8: Progress Report

Print progress after each issue:

```
✓ #27 — Content schema system (PR #44)
✓ #28 — Page composition (PR #45)
→ #29 — Starting...
  #30 — Pending
  ...
```

## Error Handling

### Recoverable Errors
- CI failure: fix and retry (max 3 attempts)
- Format errors: run `pnpm run format` and retry
- Type errors: fix the code and retry

### Pipeline Abort Conditions
- Issue doesn't exist or is already closed → **skip** (continue to next)
- Design doc missing → **abort pipeline** (cannot implement without spec)
- CI fails 3 times → **abort pipeline** (needs human intervention)
- `master` has merge conflicts → **abort pipeline**

When aborting, print:
```
Pipeline ABORTED at issue #N
Completed: #27, #28
Failed: #29 — reason
Remaining: #30, #31, ..., #38
```

## Rules

- No AI attribution in commits
- Stage specific files, never `git add .`
- Conventional commit format
- Every issue gets a clean code review — fix ALL findings before PR
- Every PR must pass CI before merge
- Every GitHub review comment must be addressed before merge
- Post-merge cleanup is required — never skipped
- One issue at a time, sequential, no parallelism between issues
- Each issue starts from a clean master with latest changes
- design.md and task.md are required per issue
- Runs unattended through the merge; the developer does not review PRs
- If an issue depends on another issue that hasn't been implemented yet, check if the dependency is in the pipeline and will be done first. If not, skip with a note.
