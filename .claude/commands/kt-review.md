---
description: "Reviews a krantho PR — checks out the branch, reads the full diff and context, runs the local checks, applies the review checklist and submits a review. Use when asked to review a PR."
argument-hint: "<pr-number>"
---

# Review PR

## Contents

- Configuration — Workspace Areas
- Phase 1: Verify Branch
- Phase 2: Fetch PR Details
- Phase 3: Get Full Diff
- Phase 4: Read Context
- Phase 5: Run Checks Locally
- Phase 6: Review Checklist — Conventions, Code Quality (TypeScript/React), Testing, Documentation
- Phase 7: Submit Review — Review Format

Structured PR review for krantho. Takes a PR number as argument: `/kt-review 5`

## Configuration

```
Repo: descoped/krantho
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

## Phase 1: Verify Branch

Ensure you're on the PR branch:
```bash
gh pr checkout $ARGUMENTS --repo descoped/krantho
```

## Phase 2: Fetch PR Details

```bash
gh pr view $ARGUMENTS --repo descoped/krantho
gh pr diff $ARGUMENTS --repo descoped/krantho --stat
gh pr checks $ARGUMENTS --repo descoped/krantho
```

## Phase 3: Get Full Diff

```bash
gh pr diff $ARGUMENTS --repo descoped/krantho
```

## Phase 4: Read Context

- Read task/design docs in `<notes directory>/issues/issue-N/`, when the notes directory is available
- Read each changed file fully (not just the diff)

## Phase 5: Run Checks Locally

Run checks for all affected areas (see table above).

## Phase 6: Review Checklist

### Conventions
- [ ] Conventional commit format
- [ ] No working document (design, task, notes) is in the diff
- [ ] PR description follows template
- [ ] `fixes #X` links issue

### Code Quality (TypeScript/React)
- [ ] No `any` types
- [ ] Proper `import type` for type-only imports
- [ ] No `@ts-ignore` (use `@ts-expect-error` with comment)
- [ ] Exported functions have return types
- [ ] Error paths handled
- [ ] Package dependency graph respected (core has no UI imports; persistence only via IPersistenceAdapter; UI packages stay parallel)
- [ ] No site-specific values in `packages/` (SiteConfig in code, globals in CMS; `site-config.json` is tools-only)
- [ ] Persistence operations go through IPersistenceAdapter

### Testing
- [ ] `pnpm run format:check` passes
- [ ] `pnpm run lint` passes
- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run test:run` passes
- [ ] New code has tests

### Documentation
- [ ] Code comments where needed
- [ ] PR description complete

## Phase 7: Submit Review

Check for self-review:
```bash
PR_AUTHOR=$(gh pr view $ARGUMENTS --repo descoped/krantho --json author -q .author.login)
CURRENT_USER=$(gh api user -q .login)
```

- Own PR: `gh pr review $ARGUMENTS --repo descoped/krantho --comment --body "REVIEW"`
- Others' PR: `gh pr review $ARGUMENTS --repo descoped/krantho --approve --body "REVIEW"` or `--request-changes`

### Review Format

**Severity levels**: Critical (must fix), Suggestion (non-blocking), Question (clarification needed)

Include: overall assessment, critical issues with `file:line` references, suggestions, positives, questions, checklist summary.
