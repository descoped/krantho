# krantho

Developer-first CMS with agentic SEO — pnpm workspace monorepo.

## What is krantho?

A content framework with a built-in Studio — the missing middle ground between "just markdown files" and "deploy a full CMS platform."

- **Studio** — Schema-driven forms, split-view markdown editor, version history, dark/light/system theme
- **Content engine** — Markdown + YAML frontmatter with SQLite persistence and auto-import
- **Server adapters** — One-line setup for Next.js, SvelteKit, or Vite (Express)
- **Schema system** — Code-first Zod definitions with runtime extensions from Studio
- **SEO archetype system** — Configurable Schema.org structured data with AI enrichment
- **LLM client** — Zero-dependency client for Anthropic, OpenAI, Gemini, OpenRouter, and Ollama; Claude Haiku 4.5 by default
- **Configuration** — One typed tree in `krantho.config.ts`, every value overridable from the environment
- **Plugin system** — Custom API endpoints, lifecycle hooks, and field types
- **Auth** — Token mode, OIDC with PKCE, role-based access (admin/editor/viewer)
- **Localization** — Locale-aware content with per-locale filtering
- **OpenAPI** — Auto-generated spec at `/api/openapi.json`, Scalar docs at `/api/docs`
- **CLI scaffolder** — `npx create-krantho` to start a new project

## Quick Start

```bash
npx create-krantho my-site
cd my-site
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the site, [http://localhost:3000/studio](http://localhost:3000/studio) for the dashboard.

## Packages

| Package | Description |
|---------|-------------|
| `@krantho/core` | Content engine, types (zero UI deps) |
| `@krantho/config` | Typed configuration tree, resolved from `krantho.config.ts` and the environment |
| `@krantho/ai` | Zero-dependency LLM client |
| `@krantho/api` | REST API handlers, auth, plugins, webhooks, OpenAPI |
| `@krantho/server` | Core handler, Studio serving, auto-import |
| `@krantho/server-next` | Next.js App Router adapter |
| `@krantho/server-sveltekit` | SvelteKit adapter |
| `@krantho/server-node` | Vite/Express adapter |
| `@krantho/next` / `@krantho/sveltekit` / `@krantho/node` | One-install bundles per framework |
| `@krantho/studio` | React SPA dashboard |
| `@krantho/schema` | Zod validation, runtime schema merger |
| `@krantho/persistence` | Persistence interface + shared utilities |
| `@krantho/persistence-sqlite` | SQLite adapter (default) |
| `@krantho/persistence-postgres` | PostgreSQL adapter (production store) |
| `@krantho/persistence-fs` | Filesystem adapter (dev) |
| `@krantho/media-local` | Media file store on local disk |
| `@krantho/media-vercel-blob` | Media file store on Vercel Blob |
| `@krantho/media-s3` | Media file store on S3-compatible storage (AWS S3, Cloudflare R2, MinIO) |
| `@krantho/media-gcs` | Media file store on Google Cloud Storage |
| `@krantho/ui-react` | React components (server + client) |
| `@krantho/ui-mui` | Material UI components |
| `@krantho/ui-tailwind` | Tailwind components |
| `@krantho/ui-svelte` | Svelte 5 components |
| `@krantho/seo` | JSON-LD, Schema.org catalog, archetypes |
| `@krantho/seo-shared` | SEO field discovery primitives (zero deps) |
| `@krantho/tools` | SEO CLI + enrichment pipeline (internal) |
| `create-krantho` | CLI scaffolder |

## Example Apps

| Port | App | Framework | UI |
|------|-----|-----------|-----|
| 4001 | `examples/nextjs-mui/` | Next.js 16 | Material UI 7 |
| 4002 | `examples/nextjs-shadcn/` | Next.js 16 | Tailwind CSS v4 |
| 4003 | `examples/sveltekit-tailwind/` | SvelteKit 2 | Tailwind CSS v4 |
| 4004 | `examples/sveltekit-shadcn/` | SvelteKit 2 | Tailwind CSS v4 |
| 4005 | `examples/react-ssr/` | React 19 + Express | Vite 8 SSR |
| 4006 | `examples/react-spa/` | React 19 | Vite 8 SPA |

All examples include: Studio, API, pages + globals + services collections. Start them with `just serve-<name>` or `just examples-dev`, which bind the ports above.

## Studio features

- Pulse: what needs attention, live and draft counts, meta-description coverage and recent activity
- Dark/light/system theme with persistent preference
- Site: every collection and the Layout; a collection view with a status filter, sort and bulk Publish/Delete
- Schema-driven editor with type badges, validation errors, custom fields
- Editor modes: Live (edit in place on the site's draft preview), Structure (the schema form and a markdown body with Split/Preview), Data (search and social previews, the JSON-LD graph with sources, rich results, enrichment, history)
- Save draft and Publish: Live, Unpublished changes, Not published
- Version history with restore
- Autosave with recovery
- Setup › Collections & schema (add runtime fields, export as Zod code)
- Collection export and import as JSON (the API also exports Markdown)
- Structure: Graph, Scopes & archetypes, Rich results, Crawlers & assistants, and enrichment
- AI provider (Setup): provider/model/API key with connection test
- Auth: token mode login/logout, OIDC with PKCE
- Locale filter (when multiple locales configured)
- Media library with folders, tags, image editor

## SEO Archetype System

Schema.org structured data configured at three levels:

1. **Site** (Structure › Scopes & archetypes › Site entities) — business type + properties
2. **Collection** (Structure › Scopes & archetypes › Collection archetypes) — document types per collection
3. **Document** (the editor's Data mode › Edit the graph) — per-page property overrides

AI enrichment fills missing properties without overwriting user edits. Frontend uses `resolveSeoContent()` for meta tags and `<SeoJsonLd>` for JSON-LD.

```bash
# Unified SEO CLI
pnpm run seo config show              # Show all archetype configs
pnpm run seo config set pages Article # Set collection types
pnpm run seo validate --all           # Check rich result eligibility
```

## Configuration

Every app has a `krantho.config.ts` holding data only: site identity, paths, persistence, auth, media (including which file store `media.provider` picks), LLM, SEO and tools settings. Collections, pages and plugins are wiring and stay in the route file.

```ts
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'Example', language: 'en', baseUrl: 'https://example.com' },
  seo: { configDir: './krantho.seo' },
})
```

The configuration resolves once at startup: built-in defaults, then `krantho.config.ts`, then the environment. Every value can be set from an environment variable, which is how a deployment configures krantho. A bad value stops startup with an error naming the variable. [`docs/configuration.md`](docs/configuration.md) lists every setting, its variable and its default.

The LLM features use a Console API key from `KRANTHO_LLM_ANTHROPIC_API_KEY`, billed per token to whoever deploys; every provider has a key of its own, such as `KRANTHO_LLM_OPENAI_API_KEY`. The default model is Claude Haiku 4.5. Choose a larger model with `KRANTHO_LLM_MODEL` or in Setup › AI provider, and give the assistant a provider of its own with `assistant.provider`. The first boot copies the provider and model into the database; after that, edits made in Studio win. The credential is read on every request, so a key set in the environment takes precedence over one saved in Studio.

## Development

Requires Node 22.9 or later and pnpm 10. The example apps and `krantho-site` load the repository root `.env` when you run their `dev` script. Copy [`.env.example`](.env.example) to `.env` and fill in only what you need. It is for development: the infra secrets for Vercel and Neon live in the deployer's own infra stack, outside this repository, which no dev server loads. Every variable is optional for local development: with none set, the apps start with no auth, SQLite under `.krantho/`, a temporary session secret, and AI enrichment reporting that no LLM provider is configured.

To run AI enrichment on your Claude subscription while developing, set `KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN` in `.env` to the token `claude setup-token` prints and choose the `claude-code` provider (Haiku only). The `anthropic` provider never reads it and uses `KRANTHO_LLM_ANTHROPIC_API_KEY`. Subscription tokens are for development on your own machine only — deployments use the `anthropic` provider with a Console API key. See [`docs/ai.md`](docs/ai.md#credentials).

```bash
pnpm install                     # Install all workspace dependencies
pnpm run build                   # Build all packages
pnpm run typecheck               # Type-check all packages
pnpm run test:run                # Run all tests
pnpm run format                  # Auto-format with Biome
```

## Tech Stack

- **TypeScript 6** — strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **Vite 8** + **Vitest 4** — workspace test runner
- **Biome 2** — formatting + lint
- **pnpm 10** — workspace monorepo
- **SQLite** (better-sqlite3) — default persistence
- **PostgreSQL** (postgres.js) — production persistence
- **Zod 4** — schema validation

## License

MIT
