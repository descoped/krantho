# @krantho/next

One-install convenience bundle for building a krantho site with **Next.js**.

```bash
pnpm add @krantho/next
```

That single install pulls in everything a typical Next.js krantho project needs:

| Bundled package | Role |
|-----------------|------|
| `@krantho/server-next` | Next.js App Router adapter (`createApiRouteHandlers`, Studio route handler) |
| `@krantho/ui-react` | React content components + server helpers |
| `@krantho/studio` | Studio SPA (served at `/studio`) |
| `@krantho/media-local` | Local disk file store for media (`media.provider: 'local'`) |
| `@krantho/seo` | Schema.org archetypes, JSON-LD, rich result tooling |

The content engine, schema system, API, and SQLite/filesystem persistence come in
transitively through `@krantho/server-next`.

This is a **dependency-only** package — it has no runtime code of its own. Import
APIs from the real packages:

```ts
import { createApiRouteHandlers } from '@krantho/next/server-next'
```

is **not** how it works. Import from the underlying packages directly:

```ts
import { createApiRouteHandlers } from '@krantho/server-next'
import { CMSTextServer, resolveSeoContent } from '@krantho/ui-react/server'
import { composeFromConfig } from '@krantho/seo'
```

Under a strict, non-hoisted `node_modules` layout (pnpm's default) a transitive
dependency cannot be imported by name. List the packages your code imports —
typically `@krantho/config`, `@krantho/schema` and `@krantho/server-next` — as direct
dependencies too.

## SEO is included but opt-in

`@krantho/seo` is installed but only activated when `krantho.config.ts` carries a
`seo` block. Zero overhead if unused.

## Postgres

The default persistence is SQLite. For Postgres, add the adapter and driver:

```bash
pnpm add @krantho/next @krantho/persistence-postgres postgres
```

## Prefer modular installs?

The bundle exists for a fast start. Power users can install the individual
packages (`@krantho/server-next`, `@krantho/ui-react`, …) and swap any piece.
