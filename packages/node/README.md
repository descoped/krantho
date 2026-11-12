# @krantho/node

One-install convenience bundle for building a krantho site with **Vite / Express
/ Node**.

```bash
pnpm add @krantho/node @krantho/ui-react
```

This bundle deliberately does **not** include a UI library — pick one yourself
(`@krantho/ui-react`, `@krantho/ui-svelte`, `@krantho/ui-mui`, or
`@krantho/ui-tailwind`). Everything else a typical Node project needs is included:

| Bundled package | Role |
|-----------------|------|
| `@krantho/server-node` | Vite / Express / Node adapter |
| `@krantho/studio` | Studio SPA (served at `/studio`) |
| `@krantho/media-local` | Local disk file store for media (`media.provider: 'local'`) |
| `@krantho/seo` | Schema.org archetypes, JSON-LD, rich result tooling |

The content engine, schema system, API, and SQLite/filesystem persistence come in
transitively through `@krantho/server-node`.

This is a **dependency-only** package — it has no runtime code of its own. Import
APIs from the underlying packages directly:

```ts
import { createHandler } from '@krantho/server-node'
import { composeFromConfig } from '@krantho/seo'
```

Under a strict, non-hoisted `node_modules` layout (pnpm's default) a transitive
dependency cannot be imported by name. List the packages your code imports —
typically `@krantho/config`, `@krantho/schema` and `@krantho/server-node` — as direct
dependencies too.

## SEO is included but opt-in

`@krantho/seo` is installed but only activated when `krantho.config.ts` carries a
`seo` block. Zero overhead if unused.

## Postgres

The default persistence is SQLite. For Postgres, add the adapter and driver:

```bash
pnpm add @krantho/node @krantho/persistence-postgres postgres
```

## Prefer modular installs?

The bundle exists for a fast start. Power users can install the individual
packages (`@krantho/server-node`, …) and swap any piece.
