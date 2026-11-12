# @krantho/sveltekit

One-install convenience bundle for building a krantho site with **SvelteKit**.

```bash
pnpm add @krantho/sveltekit
```

That single install pulls in everything a typical SvelteKit krantho project needs:

| Bundled package | Role |
|-----------------|------|
| `@krantho/server-sveltekit` | SvelteKit adapter (`createApiHandlers`) |
| `@krantho/ui-svelte` | Svelte 5 content components |
| `@krantho/studio` | Studio SPA (served at `/studio`) |
| `@krantho/media-local` | Local disk file store for media (`media.provider: 'local'`) |
| `@krantho/seo` | Schema.org archetypes, JSON-LD, rich result tooling |

The content engine, schema system, API, and SQLite/filesystem persistence come in
transitively through `@krantho/server-sveltekit`. Studio is the same
React SPA served by every framework adapter — SvelteKit ships it without any
framework contamination.

This is a **dependency-only** package — it has no runtime code of its own. Import
APIs from the underlying packages directly:

```ts
import { createApiHandlers } from '@krantho/server-sveltekit'
import { composeFromConfig } from '@krantho/seo'
```

Under a strict, non-hoisted `node_modules` layout (pnpm's default) a transitive
dependency cannot be imported by name. List the packages your code imports —
typically `@krantho/config`, `@krantho/schema` and `@krantho/server-sveltekit` — as direct
dependencies too.

## SEO is included but opt-in

`@krantho/seo` is installed but only activated when `krantho.config.ts` carries a
`seo` block. Zero overhead if unused.

## Postgres

The default persistence is SQLite. For Postgres, add the adapter and driver:

```bash
pnpm add @krantho/sveltekit @krantho/persistence-postgres postgres
```

## Prefer modular installs?

The bundle exists for a fast start. Power users can install the individual
packages (`@krantho/server-sveltekit`, `@krantho/ui-svelte`, …) and swap any
piece.
