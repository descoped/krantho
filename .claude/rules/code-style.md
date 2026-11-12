# Code Style Rules

- Filenames: lowercase with hyphens (`content-engine.ts`, not `ContentEngine.ts`).
- Named exports over default exports — better refactoring support and tree-shaking.
- Explicit exports in `index.ts` — no `export * from` barrel re-exports.
- Prefer `const` assertions for literal types: `as const`.
- Use early returns to reduce nesting depth.
- Max function length: ~40 lines. Extract sub-operations if longer.
- Max file length: ~400 lines. Split into focused modules if larger.
- Formatting is handled by Biome (2-space indent, single quotes, trailing commas). Do not manually adjust formatting.
- Linting and formatting are Biome: `pnpm run format` writes the formatting, `pnpm run format:check` checks it, `pnpm run lint` checks the lint rules and import order. Type checks are `tsc` (`pnpm run typecheck`).
- A `biome-ignore` comment states why the rule does not apply there.

## Documentation Writing

- **No drift-prone counts in directional documents.** Directional documents describe what something *is* — counts there rot silently because nobody is watching them. Never write counts of current state in:
  - `CLAUDE.md` (project or global)
  - `.claude/rules/`
  - memory files
  - `README.md` intro, overview, and feature lists
  - slash commands / skills (`.claude/skills/`, `.claude/commands/`)
  - commit messages, issue titles, PR titles
- Banned phrasings (examples): "N packages", "N tests", "N archetypes", "N types", "N builders", "N endpoints", "N handlers", "N providers", "N fields", "N lines". Describe **capabilities and structure** instead — "the archetype catalog covers Google rich result types, business subtypes, and core Schema.org types" instead of "44 archetypes in the catalog."
- **Counts ARE allowed where the number is the point** and someone explicitly maintains it:
  - `docs/` — developer documentation with benchmarks, capacity specs, performance characteristics, feature limits, API rate limits
  - Changelogs and release notes — frozen historical records
  - Prescriptive thresholds (e.g. `~40 lines max function length`, `80% coverage target`) — these are limits, not descriptive counts
  - Configuration defaults (e.g. `default cache TTL 5 minutes`)
  - Procedural step numbering (step 1, step 2, step 3) — ordinals
  - Version numbers (e.g. `TypeScript 6`, `Vitest 4`) — labels, not counts
- **The test:** will this number drift silently as the code evolves? If yes, ban it. If no (frozen, measured, or prescriptive), allow it.
- If you find a stale count in a directional document, remove it — don't update it.
