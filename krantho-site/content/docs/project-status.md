---
title: Project status
description: Where krantho stands today, how to run it from source, and what the install commands in these docs refer to.
area: get-started
order: 15
level: beginner
prerequisites: [introduction]
next: [installation]
related: [first-page, studio, configuration]
status: published
---

Krantho is in active development. This page says plainly what that means for you: what exists, what is not available yet, and how to run krantho today.

## Where the project stands

- **The code is in one repository.** The packages, Studio, the example apps and this site live in the `descoped/krantho` repository on GitHub. The repository is private for now.
- **The packages are not published.** `create-krantho` and the `@krantho/*` packages are not on npm yet, so `pnpm add @krantho/next` and `npx create-krantho` do not work today.
- **The site you are reading runs on krantho.** Every page here, these docs included, is content in krantho's own content templates, edited in its Studio.

APIs can still change before the first release. These docs describe the code as it is now, and are updated with it.

## What the install commands mean

The installation steps in these docs use the published packages the first release will provide — for example `pnpm add @krantho/next` or `npx create-krantho my-site`. They show how a project will install krantho, and the install pages link back here.

Until the first release, the packages exist only inside the repository, where the example apps use them from the workspace. The code you write — `krantho.config.ts`, `krantho.collections.ts`, the API and Studio routes, your page templates — is the same either way. To try it now, run it from source.

## Run krantho from source

You need Node.js 22.9.0 or later, pnpm 10 (`corepack enable` provides it) and access to the repository.

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

## What comes next

The first release is planned to publish the packages and the scaffolder to npm. From then on, the install commands in these docs work as written, and this page changes to say so.
