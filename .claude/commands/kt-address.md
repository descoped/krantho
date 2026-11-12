---
description: "Addresses review feedback on a krantho PR or issue — fetches every comment and thread, fixes or answers each, verifies, pushes and comments. Use when a PR or issue has feedback to work through."
argument-hint: "<pr-or-issue-number>"
---

# Address Feedback

Systematically address feedback on a krantho PR or issue. Takes a PR or issue number: `/kt-address 5`

## Configuration

```
Repo: descoped/krantho
```

## Phase 1: Determine Type and Fetch Context

```bash
# Try PR first
gh pr view $ARGUMENTS --repo descoped/krantho 2>/dev/null || gh issue view $ARGUMENTS --repo descoped/krantho
```

## Phase 2: Ensure Correct Branch

For PRs:
```bash
gh pr checkout $ARGUMENTS --repo descoped/krantho
```

## Phase 3: Gather All Feedback

```bash
# PR comments and reviews
gh pr view $ARGUMENTS --repo descoped/krantho --comments
gh api repos/descoped/krantho/pulls/$ARGUMENTS/reviews
gh api repos/descoped/krantho/pulls/$ARGUMENTS/comments
```

## Phase 4: Create Feedback Checklist

Organize all feedback items by severity:
- **Critical**: Must fix, each in a separate commit
- **Suggestions**: Consider carefully, implement or explain why not
- **Questions**: Answer in response, make code changes if needed

## Phase 5: Address Each Item

For each feedback item:
1. Read the relevant code
2. Make the fix
3. Commit with reference: `fix: address review — DESCRIPTION`
4. Run checks: `pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run test:run`

## Phase 6: Push Changes

```bash
git push
```

## Phase 7: Post Response

Post a response comment on **both** the PR and the related issue:

**PR comment** — detailed table of changes per feedback item with commit refs:
```bash
gh pr comment $ARGUMENTS --repo descoped/krantho --body "RESPONSE"
```

**Issue comment** — brief summary of what was addressed:
```bash
# Extract issue number from PR body (fixes #N)
gh issue comment N --repo descoped/krantho --body "Review feedback addressed in PR #$ARGUMENTS — SUMMARY"
```

## Rules

- Address critical issues first
- Each fix in a separate commit for traceability
- Run full check suite after all fixes
- Explain decisions — don't silently skip feedback
- **Always comment on both PR and issue** — the PR gets the detailed breakdown, the issue gets the summary
