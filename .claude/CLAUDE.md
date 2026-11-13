# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**krantho** is a developer-first CMS with agentic SEO, organized as a pnpm workspace monorepo. Each package publishes independently to npm under the `@krantho/` scope.

The framework provides:
- A content engine with caching, markdown processing, and version history
- Studio, the dashboard for editors (a React SPA), with schema-driven forms, SEO tools, and content management
- Server adapters for Next.js, SvelteKit, and Vite (Express/Node)
- Pluggable persistence (SQLite default, Postgres supported, filesystem for dev)
- A schema system with code-first definitions and runtime extensions
- An agentic SEO archetype system with AI-driven Schema.org structured data generation
- A zero-dependency LLM client (`@krantho/ai`)
- A typed configuration tree (`@krantho/config`) resolved from `krantho.config.ts` and the environment
- A plugin system for custom API endpoints, hooks, and field types
- Localization support with locale-aware content and API filtering
- A CLI scaffolder (`create-krantho`) for new projects

## Greenfield Rules (never violate)

This is a **greenfield project**. There is no legacy code, no migration path, no backward compatibility.

- **No backward-compatibility shims.** If something is wrong, delete it and write it right.
- **No migration code.** No version checks, no feature flags for old behavior.
- **No dead code.** If it's unused, delete it. Git has history.
- **No site-specific content in packages.** Zero hardcoded domains, business names, locales, or content in `packages/`. Example apps (`examples/`) and the krantho site (`krantho-site/`, including its developer documentation) use realistic hardcoded content — that's their purpose.
- **No placeholder implementations.** No `TODO` stubs shipped.
- **Fix directly.** Wrong abstraction? Rewrite it. Wrong name? Rename it everywhere.
- **Right-size every change.** Do exactly what's needed — no more, no less.

## Tech Stack

- **Language**: TypeScript 6.x (strict mode), module: ESNext, target: ES2022
- **Build**: pnpm workspace monorepo with per-package `tsc`
- **Frameworks**: Next.js 16.x / React 19.x, SvelteKit 2 / Svelte 5
- **UI**: MUI v7 (optional), Tailwind CSS v4 (optional), plain HTML + semantic CSS
- **Content**: Markdown with YAML frontmatter, SQLite persistence
- **Studio**: React SPA (Vite), served as static files by server packages
- **Testing**: Vitest 4.x
- **Formatting**: Biome 2.x
- **Package Manager**: pnpm 10.x

## Commands

```bash
pnpm run build                             # Build all packages
pnpm run typecheck                         # Type-check all packages
pnpm run format                            # Auto-format with Biome
pnpm run format:check                      # Check formatting (CI)
pnpm run lint                              # Biome lint rules and import order (CI)
pnpm run test:run                          # Run all tests once
pnpm run clean                             # Remove all dist/ directories

# Per-package
pnpm --filter @krantho/core run build      # Build single package
pnpm --filter @krantho/core run typecheck  # Typecheck single package

# Studio (must build before serving)
pnpm --filter @krantho/studio run build     # Build Studio SPA
```

### Testing Requirements

- `pnpm run test:run` includes postgres testcontainer tests — **Docker must be running** or the persistence-postgres suite fails with "Could not find a working container runtime strategy".
- After a local Node upgrade, better-sqlite3 tests fail with a `NODE_MODULE_VERSION` mismatch (`pnpm rebuild` does NOT fix it). Recompile in place:
  `cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run build-release`

### SEO CLI (unified, archetype-driven)

```bash
pnpm run seo config show                   # Show all archetype configurations
pnpm run seo config set-site <Type>        # Set site-level Schema.org type
pnpm run seo config set <col> <Types>      # Set collection archetype types
pnpm run seo config clean                  # Remove all SEO configs (clean slate)
pnpm run seo preview <col/slug>            # Preview effective config for a document
pnpm run seo validate --all                # Check rich result eligibility
```

### SEO Legacy Pipeline (deterministic, no AI)

```bash
pnpm run seo:generate                      # Generate structured-data.json + llms.txt + faq-pages.json
pnpm run seo:enrich:llms                   # Generate llms.txt link descriptions
```

### API Documentation

```bash
# OpenAPI 3.1 spec + Scalar interactive docs
GET /api/openapi.json                      # Auto-generated spec
GET /api/docs                              # Scalar API reference UI
```

## Architecture

### Workspace Packages

```
packages/
├── core/                # @krantho/core — content engine, types (zero UI deps)
├── config/              # @krantho/config — typed configuration tree, env resolution
├── persistence/         # @krantho/persistence — IPersistenceAdapter interface + types
├── persistence-fs/      # @krantho/persistence-fs — FileSystemAdapter
├── persistence-sqlite/  # @krantho/persistence-sqlite — SQLiteAdapter (default)
├── persistence-postgres/ # @krantho/persistence-postgres — PostgresAdapter
├── schema/              # @krantho/schema — validation, runtime schema merger
├── api/                 # @krantho/api — REST handlers, auth, plugins, webhooks
├── server/              # @krantho/server — core handler, Studio serving, auto-import
├── server-next/         # @krantho/server-next — Next.js App Router adapter
├── server-sveltekit/    # @krantho/server-sveltekit — SvelteKit adapter
├── server-node/         # @krantho/server-node — Vite/Express adapter
├── next/                # @krantho/next — one-install bundle for Next.js projects
├── node/                # @krantho/node — one-install bundle for Vite/Express projects
├── sveltekit/           # @krantho/sveltekit — one-install bundle for SvelteKit projects
├── ai/                  # @krantho/ai — zero-dependency LLM client
├── studio/              # @krantho/studio — React SPA dashboard
├── media-local/         # @krantho/media-local — local disk file store
├── media-vercel-blob/   # @krantho/media-vercel-blob — Vercel Blob file store
├── media-s3/            # @krantho/media-s3 — S3-compatible file store
├── media-gcs/           # @krantho/media-gcs — Google Cloud Storage file store
├── ui-react/            # @krantho/ui-react — React components (server + client)
├── seo-shared/          # @krantho/seo-shared — SEO field discovery primitives (zero deps)
├── seo/                 # @krantho/seo — JSON-LD, archetypes, Schema.org catalog
├── ui-svelte/           # @krantho/ui-svelte — Svelte 5 components
├── ui-mui/              # @krantho/ui-mui — MUI components
├── ui-tailwind/         # @krantho/ui-tailwind — Tailwind components
├── tools/               # @krantho/tools — SEO pipeline (private)
└── create-krantho/      # create-krantho — CLI scaffolder
```

### Package Dependency Graph

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
  @krantho/ui-react, @krantho/ui-mui, @krantho/ui-tailwind, @krantho/ui-svelte

@krantho/config                  ← zod only; resolved once by server + tools
@krantho/ai                      ← zero deps, used by api + tools
@krantho/media-local             ← local disk file store, loaded by server
@krantho/media-vercel-blob       ← Vercel Blob file store, loaded by server
@krantho/media-s3                ← S3-compatible file store, loaded by server
@krantho/media-gcs               ← Google Cloud Storage file store (zero deps), loaded by server
@krantho/seo-shared              ← zero deps, SEO field discovery primitives, used by seo + ui-react + studio + api
@krantho/seo                     ← core + seo-shared, peer: react
@krantho/studio                   ← React SPA, talks to API via fetch
```

### Content Model

Content is stored in Markdown files with YAML frontmatter. In files, metadata is called **frontmatter**. Inside the CMS (API, Studio, persistence), the same data is called **fields**.

| Term | Context | Example |
|------|---------|---------|
| Frontmatter | Markdown files | `title: 'About Us'` in YAML header |
| Fields | CMS / API / Studio | `fields.title`, `fields.description` |
| Body | Both | Markdown content below frontmatter |
| Sections | Both | `## headings` parsed into named sections |

**Standard page fields:** `title`, `description` (publication state is a system field, never a `status` field)
**Service fields:** `title`, `description`, `ingress`, `order`
**SEO field:** `meta-description` — separate from `description`, falls back to `description` if empty.

No page composition or builder system. Content is fields + body. Layout is a frontend concern.

| Concern | Where | Who reads |
|---------|-------|-----------|
| Configuration | `krantho.config.ts` + env, resolved by `@krantho/config` | server, API, tools |
| Site Identity | `site` section of the configuration | API, SEO, Studio |
| Layout Content | content/globals/ | Layout components, Studio |
| SEO Archetype Config | seo_config table (site, collection, route); a document's own SEO in its versioned metadata (`metadata.seo`) | API, Studio, CLI, frontend |
| SEO Tool Config | content/seo/site-config.json | @krantho/tools only (legacy) |

CMS does not depend on SEO. Not all sites need SEO.

### SEO Archetype System

Schema.org structured data is configured through archetypes at four levels:
- **Site** (Structure → Scopes & archetypes → Site entities): business type + properties + OG defaults
- **Collection** (Structure → Scopes & archetypes → Collection archetypes): document archetypes per collection (primary config)
- **Route** (optional): URL-pattern overrides for advanced use cases
- **Document** (the editor's Data mode → Edit the graph): per-page property overrides, saved in the document's versioned metadata (`metadata.seo`) with its draft and publish lifecycle

Developer config seeds SEO on startup via the `seo` section of `krantho.config.ts`:
```typescript
seo: { identity: 'ProfessionalService', collections: { pages: ['Article'], services: ['Service'] } }
```

The archetype catalog covers Google rich result types, business subtypes, and core Schema.org types.
Smart property resolution fills Schema.org properties the document does not set from CMS metadata and the page path; types with a dedicated builder take only the fields that builder reads — authors fill what requires human judgment.

The `composeFromConfig()` function generates a unified `@graph` with site + document entities.
Frontend uses `resolveSeoContent()` for meta tags (with OG + Twitter) and `<SeoJsonLd>` for JSON-LD.
AI enrichment fills missing properties without overwriting user edits.

Studio's Structure destination is organised in tabs: Graph, Scopes & archetypes, Rich results, Crawlers & assistants.
The editor's side panel measures each page's search and sharing text against the site's limits, and its Data mode the page's graph, rich results and enrichment.

### Studio Architecture

Single React SPA in `@krantho/studio/dist/`. Served at `/studio` by all server packages. Framework-agnostic — one package graph, one deploy. A SvelteKit app ships the React Studio without framework contamination.

### Important Notes

- Each package declares its own dependencies — self-contained for npm publishing.
- UI packages are parallel alternatives, not layers.
- Cross-package imports use `@krantho/*`. Internal imports use relative paths.
- Server packages handle adapter creation, auto-import, engine setup, and Studio serving.
- Collections group content by type: pages for list→detail, globals for site-wide data.
- The user documentation is the Krantho Developer Documentation at `krantho.com/docs`: the `docs` collection of `krantho-site` (`krantho-site/content/docs/`), written with the `docs` skill. `docs/` holds the developer docs for people building krantho itself.
- `examples/nextjs-shadcn` (port 4002) is the **parity reference** for all example apps — the other examples mirror its structure and API route configuration. Examples share `examples/content/`.

## Documentation Conventions

The repository holds the project and nothing else. Working material is never committed and never
written into the checkout.

| Place | Purpose | Who writes |
|-------|---------|------------|
| `docs/` | Permanent project documentation. | Human / reviewed |
| `<notes directory>/issues/issue-N/` | An issue's `design.md` and `task.md`. They stay there after the merge. | Claude / AI |
| `<notes directory>/notes/` | Analyses, reviews, plans and other working notes. | Claude / AI |

The **notes directory** is `~/.dossier/descoped/krantho/`: the maintainer's private notes for this project,
outside the repository. Commands and rules write `<notes directory>` for it. A contributor without it keeps
working documents in any directory outside the checkout.

- **Design docs** (`issue-N/design.md`) must be **self-contained** — never reference a working note.
- **All filenames** in `docs/` and in the notes directory must be **lowercase** with hyphens.
- **Working notes** are prefixed with a UTC timestamp: `YYYYMMDD-HHMMSS-name.md`.
- An issue or pull request never links to a working document: the notes directory is private.

## Workflow

- **Issues describe WHAT and WHY**, never HOW.
- **Design docs** contain implementation specs. Self-contained — copy all specs verbatim.
- **Conventional commits**: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- **Releases**: one semver version for the whole repository, tagged `vMAJOR.MINOR.PATCH` — `.claude/rules/releases.md`, `/kt-release`.
- **Production data**: krantho.com is one production instance on Vercel. Its infra is the operator's own OpenTofu stack outside this repository, whose secrets live outside the checkout; `tofu apply` takes a reviewed plan, and a database reset is the operator's act — `.claude/rules/production-data.md`.
- **Public content**: the site, docs, release notes, PRs and CI logs are public. They never carry a person's name or the production deployment's internals (Vercel account, deployment URLs, IDs, infra, the maintainer's machine) — `.claude/rules/public-content.md`.
- **Process scales to the work** — the ladder in `.claude/rules/way-of-work.md`: lean fix, `/kt-start` issue pipeline, `/kt-pipeline` batches, multi-agent orchestration (propose-only), or `/kt-spec-loop` for long-horizon goals. Long-horizon unattended work runs as a spec-driven loop under `.claude/rules/spec-driven-loop.md` — locked spec, blind verification, out-of-band position, review-gated merge.
