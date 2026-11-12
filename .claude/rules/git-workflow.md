# Git Workflow Rules

## Branching Model

```
master (protected — changes land through reviewed PRs)
  └── feature/issue-N or fix/description (working branch)
        ├── worktree: fix-error-boundary (agent A)
        ├── worktree: fix-react-hooks (agent B)
        └── worktree: refactor-schema (agent C)
```

- Never commit directly to `master`. Work on feature/fix branches.
- Merge to `master` only through a PR. The developer does not review PRs: the automated
  review (`.github/workflows/claude.yml`) reviews every PR, Claude fixes or answers each
  finding on the PR, and squash-merges once CI is green and every finding is addressed.
  The review must have posted first: no comment yet means it has not run.
- A PR that changes `.github/workflows/claude.yml` gets no automated review: the action
  skips a PR that edits its own workflow. Merge it once CI is green, and say on the PR
  that the review could not run.
- Releases are separate: nothing is released or deployed to production without the
  developer's explicit approval (`.claude/rules/releases.md`).
- Never push without explicit request.
- Always use **squash merge** (`gh pr merge --squash`) — one clean commit per PR on master.
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

## Titles and Commit Messages

- **Never use iteration words** in commit messages, issue titles, or PR titles: `phase`, `tier`, `work package`, `milestone`, `sprint`, `wave`, `stage`, `step N`, `part N`, `iteration`, `round`.
- These words are iteration-local: "Phase 1" for one initiative is meaningless in another, and they become noise the moment the iteration is over.
- State the **actual intent** — what changes and why. Scope with conventional commit prefixes: `feat(seo):`, `fix(studio):`, `refactor(persistence):`.
- Bad: `feat: Phase 1 — versioning model`, `feat(media): Phase 4 folders`, `SEO: Graph browser — Phase 8a`
- Good: `feat: append-only versioning model`, `feat(media): folders with folder tree UI`, `feat(seo): read-only JSON-LD graph browser`

## Worktree Rules

Every worktree lives in `.claude/worktrees/<name>` inside the repository — the directory Claude
Code manages, gitignored. Never in a sibling directory of the checkout.

- **Work for the current branch** (parallel agents, an isolated fix or experiment): `EnterWorktree`
  with `name`, or `isolation: "worktree"` on an agent. `.claude/settings.json` sets
  `worktree.baseRef: "head"`, so the worktree branches off the current working branch, and its
  changes merge back to that branch — never directly to master.
- **Independent work with its own PR** (a spec loop, a fix unrelated to the current branch):
  `git worktree add .claude/worktrees/<name> -b <branch> origin/master`, then `EnterWorktree` with
  the absolute `path` (`<repository root>/.claude/worktrees/<name>`) to move the session into it,
  before any `cd` into it. A relative `path`, or one given after a `cd` has already moved the
  session, resolves to a nested folder outside `.claude/worktrees/` and asks for a permission
  prompt.
- **A session in a worktree runs git only in that worktree.** To work in another one, leave with
  `ExitWorktree` (`keep`) and enter the other with its absolute `path`.
- Name worktrees descriptively: `fix-<short-description>`, `refactor-<short-description>`,
  `issue-<N>` for a spec loop.
- Multiple agents can work in parallel on different worktrees — they must not touch the same files.
- Run full verification before merging a worktree back: `pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run test:run`
- Discard worktrees that fail verification rather than force-merging broken code.
- Remove a worktree when its work is merged or abandoned: `ExitWorktree` with `remove` for one
  created with `EnterWorktree`, otherwise `git worktree remove .claude/worktrees/<name>` and
  delete its local branch.
- A removal is done when the directory is gone, not when git stops listing it. On macOS, Finder can
  write a `.DS_Store` into the tree during the delete; git then fails with "Directory not empty"
  after it has already dropped the worktree from its list, and `git worktree prune` does not clear
  what is left. `scripts/claude/finish-worktree-removal.sh` deletes such leftovers and nothing
  else; hooks in `.claude/settings.json` run it at session start, after a worktree removal and
  when a subagent stops.

## Commenting on Pushes

Every push that relates to an open PR or issue MUST be documented:

- **Push to PR branch** (review fixes, CI fixes, follow-up changes) → comment on the PR summarizing what was pushed
- **Push to master referencing an issue** (`refs #N`, `fixes #N`, follow-up fixes) → comment on both the PR and the issue
- **Post-merge follow-ups** → comment on both the original PR and the issue

This is not optional. If there's no comment documenting a push, the push is incomplete. Do this immediately after pushing, not when reminded.

## Staging and Committing

- Stage specific files by name. Never use `git add -A` or `git add .`
- Never commit `.env`, secrets, or credentials files.
- Never amend published commits — create new commits instead.
- Never force-push without explicit developer approval.

## Cross-Agent Coordination

When multiple agents work in parallel:

- Each agent owns its worktree — no agent should modify files in another agent's worktree.
- If two agents need to modify the same file, they must work sequentially, not in parallel.
- After all worktrees merge back, run the full verification pipeline on the working branch.
