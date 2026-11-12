---
name: kt-freestyle
description: >
  Structures freestyle fix-and-verify work in long-running development
  sessions — isolates changes in worktrees, verifies them with the area
  gates, and merges back safely, while the developer decides the direction.
  Branches out to formal workflows (/kt-start, /kt-issue) when needed. Use
  when the developer says "fix this", "this is broken", "check this",
  "verify", "run checks", "types are wrong", "build fails", "clean this up",
  "refactor", or any variation of "something needs fixing", or wants to
  explore, prototype, or iterate on code without risk to the main branch.
metadata:
  filePattern:
    - 'packages/**/*'
    - 'examples/**/*'
  bashPattern:
    - 'pnpm run (lint|typecheck|test|build|format)'
    - 'just (check|lint|typecheck|test|build|format)'
---

# Verify and Fix

## Contents

- Workflow
- Understand — Scope Detection, Package Dependency Flow
- Isolate — Branch Gate (mandatory), Worktree Isolation, Branching Model, When to Skip the Worktree
- Fix — Brief Plan, Thoroughness Rule, Cross-Layer Checks
- Verify — Full Pipeline, Area-Specific Quick Checks
- Pause
- Branching to Formal Workflows
- Rules

A freestyle skill for long-running development sessions. The developer
decides what to work on, how deep to go, and when to stop. This skill
provides the safety net: worktree isolation, cross-layer awareness,
verification, and controlled merging.

Think of this as a workbench — always available, no ceremony required,
but structured enough that nothing gets lost or accidentally merged.

## Workflow

There is no fixed sequence. The developer drives. But the building blocks
are always the same:

```
Understand → Isolate → Fix → Verify → Pause
      ↑                              |
      └──────── iterate ─────────────┘
```

The developer may loop through this many times in a session, working on
different things, branching off to formal workflows, or just exploring.

## Understand

The developer describes what they want to work on. This could be anything:

- A specific bug or error
- A vague "something feels off"
- A code review finding
- A refactoring idea
- An exploration ("what happens if we...")

Read the relevant code to understand the situation. If the problem is vague,
ask one clarifying question — don't over-ask.

### Scope Detection

Map the work to affected areas. Changes in one layer often ripple to others.

| Problem type            | Primary package              | Also check                                              |
| ----------------------- | ---------------------------- | ------------------------------------------------------- |
| Core engine bug         | `packages/core/`             | persistence, schema, api, server — the downstream chain |
| Persistence issue       | `packages/persistence*/`     | the IPersistenceAdapter contract, all three adapters    |
| Schema issue            | `packages/schema/`           | api handlers that validate, Studio schema editor        |
| API handler issue       | `packages/api/`              | server packages, Studio API client, OpenAPI spec        |
| Server / adapter issue  | `packages/server*/`          | every example app, Studio serving, auto-import           |
| Studio issue          | `packages/studio/`            | the API endpoint it calls; rebuild before serving       |
| React component bug     | `packages/ui-react/`         | both `server/` AND `client/` variants                   |
| SSR/CSR mismatch        | `packages/ui-react/`         | server components vs client components                  |
| MUI / Tailwind / Svelte | `packages/ui-mui/` etc.      | peer dep compatibility; UI packages are parallel        |
| LLM client issue        | `packages/ai/`               | api enrichment handlers, tools scripts                  |
| SEO issue               | `packages/seo*/`             | archetype catalog, JSON-LD output, Studio SEO tabs      |
| Media issue             | `packages/media-local/`      | server media config, Studio media library               |
| SEO tool issue          | `packages/tools/`            | site-config.ts, route-maps.ts, llm-config.ts            |
| Type error              | affected package             | all packages importing the changed type                 |
| Content structure issue | `examples/content/`          | example apps, SEO pipeline                              |
| Test failure            | `packages/*/test/`           | the source code the test covers                         |
| Build failure           | varies                       | start from the root cause, follow the cascade           |

### Package Dependency Flow

```
@krantho/core                    ← zero UI deps
    ▲
@krantho/persistence             ← core types only
    ▲
@krantho/persistence-*           ← core + persistence (sqlite, postgres, fs)
    ▲
@krantho/schema                  ← core + persistence + zod
    ▲
@krantho/api                     ← schema + core + persistence (handlers, auth, plugins)
    ▲
@krantho/server                  ← api (handler, Studio serving, auto-import)
    ▲
@krantho/server-next / server-sveltekit / server-node

UI packages (parallel, independent):
  @krantho/ui-react    → packages/ui-react/    (server + client components)
  @krantho/ui-mui      → packages/ui-mui/      (MUI components)
  @krantho/ui-tailwind → packages/ui-tailwind/ (Tailwind components)
  @krantho/ui-svelte   → packages/ui-svelte/   (Svelte 5 components)

@krantho/ai          ← zero deps, used by api + tools
@krantho/seo-shared  ← zero deps, used by seo + ui-react + studio + api
@krantho/seo         ← core + seo-shared
@krantho/media-local ← used by server
@krantho/studio       ← React SPA, talks to the API via fetch
@krantho/tools       ← SEO pipeline (private)
```

Changes in core ripple to all packages. UI packages are independent of each other.
When fixing a React component, check BOTH server/ and client/ variants.

## Isolate

### Branch Gate (mandatory)

Before ANY edits, check `git branch --show-current`. If you are on
`main`, create a working branch first:

```
git checkout -b feature/<description> or fix/<description>
```

This is not optional. Never edit files on main. The worktree decision
below is separate from this requirement.

### Worktree Isolation

Work in a worktree to keep the working branch clean and enable parallel
agent work.

```
EnterWorktree with name: fix-<short-description>
```

The worktree is created in `.claude/worktrees/<name>` and branches off the current working branch
(`worktree.baseRef: "head"` in `.claude/settings.json`). Never create a worktree by hand outside
`.claude/worktrees/` — see `.claude/rules/git-workflow.md`.

### Branching Model

The developer works on a branch (not main). Worktrees branch off that
working branch for individual fixes or explorations:

```
main (protected — changes land through reviewed PRs)
  └── feature/issue-N or fix/description (working branch)
        ├── worktree: fix-content-loader (agent A)
        ├── worktree: fix-react-hooks (agent B)
        └── worktree: refactor-schema (agent C)
```

Multiple agents can work in parallel on different worktrees. Each worktree
merges back to the working branch when verified. The working branch merges
to main through a PR, per `.claude/rules/git-workflow.md`.

### When to Skip the Worktree

- The fix is trivial (single line, single file)
- The developer explicitly says to work in place
- Already inside a worktree

Detect context: check `git branch --show-current` and whether the path
contains worktree indicators.

## Fix

### Brief Plan

For non-trivial changes, state what you plan to do in one or two sentences
before making edits. Not a design document — just enough for the developer
to course-correct if needed.

### Thoroughness Rule

After fixing the reported issue, **grep the entire codebase for the same
pattern**. Fix all instances in one pass. If you find a missing null check,
search for all similar unchecked accesses. If you rename a type, find all
importers.

### Cross-Layer Checks

| If you fix...                            | Also check and update...                                |
| ---------------------------------------- | ------------------------------------------------------- |
| `packages/core/` type or interface       | All packages that depend on core                        |
| `packages/ui-react/` server component    | Matching client/ variant — identical prop interface?    |
| `packages/ui-react/` client component    | Matching server/ variant                                |
| `packages/persistence/` interface        | persistence-fs, schema discover.ts                      |
| `packages/schema/` inference rules       | reserved-keys.ts, validate.ts                           |
| `packages/tools/` site-config.ts         | All SEO tools, route-maps.ts                            |
| A type exported from any package         | All packages importing that type                        |

## Verify

Run checks for every affected area. Don't stop on first failure — collect
all results.

### Full Pipeline

```bash
just check    # format:check + lint + build + typecheck
```

Or individually:

```bash
pnpm run format:check    # Biome — formatting correct
pnpm run lint            # Biome lint rules and import order
pnpm run typecheck       # TypeScript strict — zero errors
pnpm run test:run        # Vitest — all tests pass
pnpm run build           # tsc — produces dist/
pnpm run format          # Biome — auto-format after fixes
```

### Area-Specific Quick Checks

For faster feedback during iteration:

| Area                          | Quick check                               |
| ----------------------------- | ----------------------------------------- |
| Core (`packages/core/`)           | `pnpm --filter @krantho/core run typecheck`   |
| Persistence (`packages/persistence*/`) | `pnpm --filter @krantho/persistence run typecheck` |
| Schema (`packages/schema/`)       | `pnpm --filter @krantho/schema run typecheck` |
| React (`packages/ui-react/`)      | `pnpm --filter @krantho/ui-react run typecheck`  |
| Tools (`packages/tools/`)         | `pnpm --filter @krantho/tools run typecheck`  |
| Tests                              | `pnpm run test:run`                           |

Run the full pipeline before any merge.

## Pause

Present results and hand control back to the developer.

```markdown
## Status

### What changed

- `path/to/file` — [what and why]

### Cross-layer

- [x] Server/client parity (or N/A)
- [x] Adapter consistency (or N/A)
- [x] Persistence interface consistency (or N/A)

### Verification

| Check        | Result  |
| ------------ | ------- |
| format:check | pass    |
| lint         | pass    |
| typecheck    | pass    |
| test:run     | pass    |
| build        | pass    |
```

**Stop and wait.** The developer decides what happens next:

- **Keep going** — iterate on the same worktree
- **Merge to branch** — worktree changes merge back to the working branch
- **Start something new** — spin up another worktree for a different task
- **Branch to ceremony** — use `/kt-start`, `/kt-issue`, or `/kt-review`
- **Run QA** — use `/kt-qa` to verify the current phase before PR
- **Create PR** — per `way-of-work.md`: one PR per lean fix or tracked issue
- **Merge to main** — through the PR, once CI and the automated review pass
- **Abandon** — discard the worktree, no harm done

## Branching to Formal Workflows

At any point, the developer can escalate to a formal workflow:

| Developer says             | Action                                     |
| -------------------------- | ------------------------------------------ |
| "Create an issue for this" | Use `/kt-issue`                           |
| "Let's do this properly"   | Use `/kt-start` with the current findings |
| "Review this PR"           | Use `/kt-review`                          |
| "Address the feedback"     | Use `/kt-address`                         |
| "Run QA"                   | Use `/kt-qa`                              |

The freestyle session doesn't end — the developer can return to exploring
after the formal workflow completes.

## Rules

Git workflow, staging, and merge rules are enforced in `.claude/rules/git-workflow.md`.
Architecture, code style, and TypeScript rules are in `.claude/rules/`.

Freestyle-specific rules (not covered by project rules):

- Grep for the same pattern across the codebase before moving on — fix all instances in one pass
- Run all checks — don't stop on first failure, collect all results
- SSR and CSR must produce equivalent output
- `examples/content/` is the source of truth for example page content
- Quality pipeline: `pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run test:run && pnpm run build`
- Never close an existing PR, or change one you did not open, without explicit developer consent
