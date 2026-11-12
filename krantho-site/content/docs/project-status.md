---
title: Project status
description: Where krantho stands, what is published and how to run it from source.
area: get-started
order: 15
level: beginner
prerequisites: [introduction]
next: [installation]
related: [first-page, studio, configuration]
status: published
---

Krantho 1.0 is released. This page says what is published, where the code lives, and how to run krantho from source.

## Where the project stands

- **The packages are on npm.** `create-krantho` and every `@krantho/*` package are published, so `npx create-krantho my-site` and `pnpm add @krantho/next` work as [Installation](/docs/installation) describes. Each release publishes all of them at one version.
- **The code is in one repository.** The packages, Studio, the example apps and this site live in the public `descoped/krantho` repository on GitHub, under the MIT licence.
- **The command line tool is built from source.** The `krantho` CLI is a Go program in the repository and is not distributed as a binary yet; see [CLI](/docs/cli).
- **The site you are reading runs on krantho.** Every page here, these docs included, is content in krantho's own content templates, edited in its Studio.

These docs describe the latest release, and are updated with each one. [The changelog](/changelog) lists what changed.

## Run krantho from source

Running from source is for working on krantho itself, or trying the examples. You need Node.js 22.9.0 or later and pnpm 10 (`corepack enable` provides it).

{{sample:run-from-source}}

What each step does:

1. **Clone the repository.** It holds the packages, the example apps and this site as one pnpm workspace.
2. **Install the dependencies** with `pnpm install` from the repository root. This also sets up `better-sqlite3`, the native driver behind the default SQLite store.
3. **Build the packages** with `pnpm run build`. The example apps use the built output of each package, and this step also builds Studio.
4. **Start the Next.js example** in `examples/nextjs-shadcn` on port 4002 with `pnpm dev -p 4002`. It is the reference for how a krantho site is wired.
5. **Open the site and Studio.** The site is at `http://localhost:4002`, Studio at `http://localhost:4002/studio`.

On first boot the example creates a SQLite database under `.krantho/` in its directory and imports its markdown content into it. Edit a page in Studio, save it, and publish it to see the change on the site.

> [!CAUTION]
> With no auth configured, Studio is open to anyone who can reach it. That is fine on your own machine. Before a site serves real traffic, turn on sign-in — see [Studio guide](/docs/studio#configure-authentication).

Every environment variable is optional for local development. The examples read a `.env` file at the repository root when there is one. With none set, the example starts with no sign-in, SQLite storage and a temporary session secret; AI enrichment reports that no LLM provider is configured until you choose one under **Setup › AI provider** in Studio or set an API key in the environment.

### The other examples

The repository holds the same example site built on several stacks. Each renders it from shared content and serves the same Studio:

| Port | Directory | Stack |
|------|-----------|-------|
| 4001 | `examples/nextjs-mui/` | Next.js with Material UI |
| 4002 | `examples/nextjs-shadcn/` | Next.js with Tailwind CSS |
| 4003 | `examples/sveltekit-tailwind/` | SvelteKit with Tailwind CSS |
| 4004 | `examples/sveltekit-shadcn/` | SvelteKit with Tailwind CSS |
| 4005 | `examples/react-ssr/` | React with Vite and Express, server-rendered |
| 4006 | `examples/react-spa/` | React with Vite, a single-page app |

Start one from its directory with `pnpm dev`, passing the port as `-p <port>` for the Next.js examples and `--port <port>` for the SvelteKit examples; the two React examples start on their own port. With [just](https://github.com/casey/just) installed, `just serve-nextjs-shadcn` starts the reference example and `just examples-dev` starts them all.

### Changing a package

Package source lives in `packages/*/src`. After a change, run `pnpm run build` again (or build the one package with `pnpm --filter @krantho/<name> run build`); the running examples pick up the new output.
