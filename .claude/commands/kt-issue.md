---
description: "Creates a krantho GitHub issue that states what and why, never how. Use when work needs a tracked issue before /kt-start."
argument-hint: "[topic]"
---

# Create Issue

Create a GitHub issue for krantho.

## Configuration

```
Repo: descoped/krantho
```

### Workspace Areas

| Area | Package | Description |
|------|---------|-------------|
| core | `packages/core/` | Content engine, types |
| persistence | `packages/persistence*/` | IPersistenceAdapter, SQLite / Postgres / filesystem adapters |
| schema | `packages/schema/` | Validation, runtime schema merger |
| api | `packages/api/` | REST handlers, auth, plugins, webhooks |
| server | `packages/server*/` | Core handler, Studio serving, framework adapters |
| studio | `packages/studio/` | React SPA dashboard |
| ui | `packages/ui-*/` | React, MUI, Tailwind, Svelte component packages |
| ai | `packages/ai/` | Zero-dependency LLM client |
| seo | `packages/seo*/` | Archetypes, JSON-LD, field discovery |
| media | `packages/media-local/` | Local media storage |
| tools | `packages/tools/` | SEO pipeline CLI |
| bundles | `packages/next/`, `packages/node/`, `packages/sveltekit/` | One-install meta-packages per framework |
| scaffolder | `packages/create-krantho/` | Project scaffolder |
| examples | `examples/` | Example apps (parity reference: `examples/nextjs-shadcn`) |

## Phase 1: Determine Scope

Ask the user:
1. Which area(s) are affected? (list workspace areas above)
2. What type of issue? (Feature, Bug, Enhancement, Docs, Refactor, Test)

## Phase 2: Gather Requirements

Collect (solution-agnostic — no file paths or code specifics):
- Context: Why is this needed?
- Current State: What's the problem? Describe behavior.
- Objective: What should be achieved? Focus on outcomes.
- Acceptance Criteria: Observable behavior only.

If design work needed, note that design doc will be created after issue.

## Phase 3: Search for Duplicates

```bash
gh issue list --repo descoped/krantho --state open --search "KEYWORDS"
gh issue list --repo descoped/krantho --state closed --search "KEYWORDS"
```

## Phase 4: Select Labels

List available with `gh label list --repo descoped/krantho` and present area + type + priority + status labels.

## Phase 5: Create Issue

```bash
gh issue create --repo descoped/krantho --title "TITLE" --body "BODY" --label "LABELS"
```

## Phase 6: Organize Issue Documents

After creation (e.g., issue #42):
1. Create folder: `mkdir -p <notes directory>/issues/issue-42` (the notes directory, outside the repository)
2. Create `design.md` if needed (self-contained, copy all specs verbatim)
3. Nothing is committed to the repository: working documents never are (`CLAUDE.md`, Documentation Conventions)

## Rules

- Issues must be solution-agnostic — WHAT and WHY, never HOW
- Search for duplicates before creating
- Design docs are self-contained — copy specs, never reference external files by path
- Return the issue URL when done
