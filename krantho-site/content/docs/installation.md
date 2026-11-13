---
title: Installation
description: One install per framework, or compose the modular packages yourself.
area: get-started
order: 20
level: beginner
stacks: [next, sveltekit, express]
prerequisites: [project-status]
next: [first-page]
related: [configuration, persistence, media, package-server]
status: published
---

Start with a single bundle package per framework. It pulls in the server adapter, UI, Studio, local media store and SEO tooling — everything a typical project needs. SQLite persistence is included; media stays off until you pick a file store, and SEO is installed but renders nothing until your pages use it.

## Prerequisites

- Node.js 22.9.0 or later
- pnpm (`corepack enable`)

## One install per framework

| Framework | Bundle | What it pulls in |
|-----------|--------|------------------|
| **Next.js** | `@krantho/next` | `@krantho/server-next`, `@krantho/ui-react`, `@krantho/studio`, `@krantho/media-local`, `@krantho/seo` |
| **SvelteKit** | `@krantho/sveltekit` | `@krantho/server-sveltekit`, `@krantho/ui-svelte`, `@krantho/studio`, `@krantho/media-local`, `@krantho/seo` |
| **Vite / Express / Node** | `@krantho/node` | `@krantho/server-node`, `@krantho/studio`, `@krantho/media-local`, `@krantho/seo` |

A bundle has no code of its own — you import from the packages it pulls in. pnpm does not let your code import a transitive dependency by name, so also add every package your own files import: `@krantho/config` (for `krantho.config.ts`), `@krantho/schema` and `zod` (for collections), the framework adapter, and the UI package your pages use.

```bash stack="next"
pnpm add @krantho/next @krantho/server-next @krantho/ui-react @krantho/config @krantho/schema zod
```

```bash stack="sveltekit"
# @krantho/core provides renderContent for load functions
pnpm add @krantho/sveltekit @krantho/server-sveltekit @krantho/core @krantho/config @krantho/schema zod
```

```bash stack="express"
# plus your UI choice
pnpm add @krantho/node @krantho/server-node @krantho/ui-react @krantho/config @krantho/schema zod
```

### Allow SQLite's native build

The default SQLite store runs on `better-sqlite3`, whose install step fetches or builds its native binary. pnpm and npm 12 skip install steps until you allow them, and SQLite then fails to load. Allow it once per project. With pnpm, put this in `pnpm-workspace.yaml` at the project root and run `pnpm install` again; pnpm 10 reads the first setting, pnpm 11 and later the second:

```yaml
onlyBuiltDependencies:
  - better-sqlite3
allowBuilds:
  better-sqlite3: true
```

With npm 12, review the pending install steps and allow `better-sqlite3`:

```bash
npm approve-scripts --allow-scripts-pending
```

A project from `create-krantho` with pnpm already has the setting. A site on Postgres only does not need it.

`@krantho/node` does not bundle a UI library on purpose — pick one yourself: `@krantho/ui-react`, `@krantho/ui-svelte`, `@krantho/ui-mui` or `@krantho/ui-tailwind`.

## Scaffold a project

```bash
npx create-krantho my-site
```

The scaffolder asks for the framework (Next.js or SvelteKit), a UI library (Tailwind CSS, MUI on Next.js only, or plain CSS), token authentication, SEO components and sample content. It writes `krantho.config.ts`, `krantho.collections.ts`, the API route, the pages and the content directory, installs the dependencies, and initializes a git repository. The generated configuration turns on local media (`media: { provider: 'local' }`); a Next.js project also caches each page until a content change (`cache: { pages: 'next-isr' }`) and shows a banner while an editor previews drafts.

## Configure

Configuration is data in `krantho.config.ts`, resolved once at startup: defaults, then the file, then the environment. Every leaf except the structured ones (such as `seo.collections`, set in code only) can be overridden by an environment variable, and secrets (API keys, the JWT secret, database URLs) belong in the environment only. See the [configuration reference](/docs/configuration) for every section and variable.

## Postgres

The default persistence is SQLite — a single file, no database server to manage. For Postgres (horizontal scaling, managed databases such as Neon or Supabase), add the adapter and driver alongside the bundle:

```bash
pnpm add @krantho/persistence-postgres postgres
```

Then select it from the environment:

```bash title=".env"
KRANTHO_PERSISTENCE_PROVIDER=postgres
KRANTHO_PERSISTENCE_POSTGRES_URL=postgres://user:password@host:5432/db
```

## Media

The bundles include `@krantho/media-local`, which stores uploads on local disk. Media turns on when `krantho.config.ts` sets `media.provider`; to store files in Vercel Blob, an S3-compatible bucket or Google Cloud Storage instead, install that store's package — see the [media guide](/docs/media).

## Modular installs

The bundles exist for a quick start. Krantho is modular — install only what your stack needs and swap any piece. The core is always the same; you choose your persistence adapter and optional features. The commands below use the Next.js adapter; see [Pick your framework adapter](#pick-your-framework-adapter) for the others.

### Choose your mode

| Mode | Adapter | Suits | Database needed? |
|------|---------|----------|-----------------|
| **Dev** | `persistence-fs` | Prototyping, static sites | No |
| **SQLite** | `persistence-sqlite` | Most projects, local development and deploy | No (file-based) |
| **Postgres** | `persistence-postgres` | Production, horizontal scaling | Yes |

### Dev mode (filesystem only)

Content lives in `.md` files. No database, no version history, no media library. Select it with `persistence: { provider: 'filesystem' }` in `krantho.config.ts` (or `KRANTHO_PERSISTENCE_PROVIDER=filesystem`).

```bash
pnpm add @krantho/core @krantho/config @krantho/schema @krantho/persistence-fs @krantho/server-next @krantho/ui-react zod
```

### SQLite mode

The full CMS with Studio, media library, versioning, content locking and SEO tools. SQLite is a single file — no database server to manage.

```bash
pnpm add @krantho/core @krantho/config @krantho/schema @krantho/persistence-sqlite @krantho/server-next @krantho/ui-react @krantho/studio @krantho/media-local zod
```

Media turns on when `krantho.config.ts` sets `media: { provider: 'local' }`; `@krantho/media-local` stores the uploads on disk. On a serverless host, pick a remote store instead — see the [media guide](/docs/media).

### Postgres mode

The same features as SQLite, webhook delivery logging included. Use this when you need horizontal scaling, a managed database (Neon, Supabase) or existing Postgres infrastructure. Set `KRANTHO_PERSISTENCE_PROVIDER=postgres` and `KRANTHO_PERSISTENCE_POSTGRES_URL`.

```bash
pnpm add @krantho/core @krantho/config @krantho/schema @krantho/persistence-postgres @krantho/server-next @krantho/ui-react @krantho/studio @krantho/media-local zod postgres
```

### Optional packages

| Package | What it adds |
|---------|-------------|
| `@krantho/seo` | Schema.org archetypes, JSON-LD, rich result validation |
| `@krantho/seo-shared` | SEO field discovery primitives (installed with `@krantho/seo`) |
| `@krantho/ai` | Zero-dependency LLM client (installed with the server; add it to call it from your own code) |
| `@krantho/media-local` | Media file store on local disk (`media.provider: 'local'`) |
| `@krantho/media-vercel-blob` | Media file store on Vercel Blob |
| `@krantho/media-s3` | Media file store on S3-compatible storage (AWS S3, Cloudflare R2, MinIO) |
| `@krantho/media-gcs` | Media file store on Google Cloud Storage |

### Pick your framework adapter

Replace `@krantho/server-next` with your framework adapter:

| Framework | Package |
|-----------|---------|
| Next.js App Router | `@krantho/server-next` |
| SvelteKit | `@krantho/server-sveltekit` |
| Vite / Express / Node | `@krantho/server-node` |
