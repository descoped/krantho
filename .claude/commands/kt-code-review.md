---
description: "Runs a deep clean-code review (SRP, DRY, dead code, stubs, complexity, coupling, naming) over a scope and writes a structured report without filing issues. Use for a quality audit of an area, the whole codebase, or a file or directory."
argument-hint: "<area | all | path>"
---

# Clean Code Review $ARGUMENTS

## Contents

- Scope
- Method
- Categories — 1. Single Responsibility (SRP), 2. Don't Repeat Yourself (DRY), 3. Dead Code & Orphans, 4. Stubs & TODOs, 5. Complexity, 6. Coupling & Cohesion, 7. Naming & Clarity
- Stack-Specific Checks (TypeScript)
- Stack-Specific Checks (React/Next.js)
- Report Format
- Rules

Perform a deep code quality analysis using clean code engineering principles. Identifies violations of SRP, DRY, dead code, stubs, complexity, coupling, and naming issues. Produces a structured report — does NOT create GitHub issues: findings are fixed as lean-fix PRs.

## Scope

`$ARGUMENTS` determines what to review:

| Argument | What's reviewed |
|----------|----------------|
| `core` | `packages/core/` — content engine, types |
| `persistence` | `packages/persistence*/` — interface + SQLite / Postgres / filesystem adapters |
| `schema` | `packages/schema/` — validation, runtime schema merger |
| `api` | `packages/api/` — REST handlers, auth, plugins, webhooks |
| `server` | `packages/server*/` — core handler, Studio serving, framework adapters |
| `studio` | `packages/studio/` — React SPA dashboard |
| `ui` | `packages/ui-*/` — React, MUI, Tailwind, Svelte components |
| `ai` | `packages/ai/` — LLM client |
| `seo` | `packages/seo*/` — archetypes, JSON-LD, field discovery |
| `tools` | `packages/tools/` — SEO pipeline CLI |
| `bundles` | `packages/next/`, `packages/node/`, `packages/sveltekit/` — one-install meta-packages |
| `scaffolder` | `packages/create-krantho/` — project scaffolder |
| `all` | Full codebase, one package at a time |
| `path/to/file` | Single file or directory |

If no argument, ask the user.

## Method

Read files using the Read tool — don't just grep. Understand context, call chains, and module boundaries before flagging anything. **Verify before reporting** — false positives waste time and erode trust.

Work in dependency order: core → persistence → persistence adapters → schema → api → server → server adapters; then the parallel packages (ui-*, ai, seo-shared, seo, media-local, studio, tools).

For each file or module, evaluate against the categories below. Skip files that are trivially clean (small, focused, well-named).

---

## Categories

### 1. Single Responsibility (SRP)

A function, type, or module should have one reason to change.

- Functions doing multiple unrelated things (fetch + transform + persist)
- Types with mixed concerns (domain model + DTO)
- Modules mixing abstraction levels
- React/Svelte components doing data fetching + business logic + rendering in one body

### 2. Don't Repeat Yourself (DRY)

- Copy-pasted code blocks across handlers, adapters, or components
- Repeated patterns differing only in type name or field
- Duplicated constants or magic numbers
- Duplicated style objects or identical component patterns

### 3. Dead Code & Orphans

- Unused functions, types, exports
- Unused imports (Biome catches most, but verify re-exports)
- Commented-out code blocks
- Files nothing imports
- Public API with no consumers

### 4. Stubs & TODOs

- `TODO`, `FIXME`, `HACK`, `TEMP` comments
- Empty function bodies or hardcoded returns
- `throw new Error("not implemented")`
- Empty catch blocks that swallow errors

### 5. Complexity

| Metric | Threshold |
|--------|-----------|
| Long function | >40 lines |
| Deep nesting | >3 levels |
| Too many params | >5 |
| Long file | >400 lines |

- Complex conditionals with >3 boolean terms
- Long switch/match chains with >6 cases

### 6. Coupling & Cohesion

- Tight coupling: module A calling internals of module B
- Circular dependencies
- Core importing UI framework types (layer violation)
- Client component doing server work or vice versa
- Components reaching into another component's internal files

### 7. Naming & Clarity

- Single-letter variables outside closures/iterators
- Misleading names (`get_X` that also mutates)
- Generic names (`data`, `result`, `value`, `info`, `helper`)
- Booleans without `is`/`has`/`can`/`should` prefix

---

## Stack-Specific Checks (TypeScript)

- `any` type annotations — use `unknown`, typed generics, or proper interfaces
- Missing return types on exported functions
- Non-null assertion (`!`) without justification
- `as` type casts hiding type errors — prefer type guards
- `enum` where a union type is simpler

## Stack-Specific Checks (React/Next.js)

- `useEffect` with missing or incorrect dependency arrays
- Client components (`'use client'`) that could be server components
- Server components using client-side APIs
- Prop drilling through >3 levels
- Business logic inside component bodies (extract to hooks or utilities)

---

## Report Format

```markdown
## Clean Code Review: [scope]

**Files reviewed**: N
**Findings**: N total (N critical, N refactor, N minor)

### SRP Violations (N)

| # | File | Symbol | Issue | Suggestion |
|---|------|--------|-------|------------|

### DRY Violations (N)

| # | Files | Pattern | Occurrences | Suggestion |
|---|-------|---------|-------------|------------|

### Dead Code (N)

| # | File | Symbol | Evidence |
|---|------|--------|----------|

### Stubs & TODOs (N)

| # | File | Type | Content |
|---|------|------|---------|

### Complexity (N)

| # | File | Symbol | Metric | Suggestion |
|---|------|--------|--------|------------|

### Coupling Issues (N)

| # | Modules | Issue | Suggestion |
|---|---------|-------|------------|

### Naming Issues (N)

| # | File | Current | Suggested | Reason |
|---|------|---------|-----------|--------|
```

After presenting the report, ask the user:
- Which findings to fix now — as lean-fix PRs (`way-of-work.md`), related findings in one area sharing a PR
- Which to skip

## Rules

- **Verify before reporting** — read the full call chain. If a function looks unused, search for all references before flagging it.
- **Read actual files** — understand context, not just pattern matches.
- **No false positives** — if you're unsure, investigate deeper or skip it. Every finding must be defensible.
- **Actionable findings only** — each finding must have a concrete suggestion.
- **Respect existing patterns** — don't flag consistent patterns unless they cause real problems.
- **Skip trivial files** — config files, generated code, test fixtures, and small utility files (<30 lines) rarely need deep review.
- **Package boundaries are intentional** — core has zero UI deps, UI packages are parallel alternatives. Don't flag the pattern, flag violations.
- **Quality checks**: `pnpm run format:check && pnpm run build && pnpm run typecheck && pnpm run test:run`
