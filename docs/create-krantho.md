# create-krantho

Interactive CLI scaffolder for new krantho projects. Run `npx create-krantho` to generate a fully configured project with your choice of framework (Next.js, SvelteKit, or a static site built with Next.js), UI library, authentication, SEO components, and sample content.

## Context

Starting a krantho project requires wiring together multiple packages (`@krantho/core`, a persistence adapter, a UI package, optionally SEO and Studio). The scaffolder generates all the boilerplate: package.json with correct dependencies, framework config, content directory structure, and a working dev server setup. The goal is zero manual configuration from `npx create-krantho` to `npm run dev`.

## Rationale

- **Separate package**: Published as `create-krantho` (no scope) so `npx create-krantho` works out of the box. This follows the convention established by `create-next-app`, `create-vite`, etc.
- **No runtime dependency on krantho**: The scaffolder generates files and exits. It does not import any `@krantho/*` packages at build time.
- **`prompts` library**: Lightweight, zero-dependency interactive prompt library. Handles text input, select menus, and toggles.
- **Template functions over template files**: Templates are TypeScript functions that return file content strings. This allows conditional generation (e.g., MUI is only available for Next.js) without a template engine.

## Architecture

```
src/
├── index.ts          # Entry point: parse args, run prompts, scaffold, install, git init
├── prompts.ts        # Interactive prompts and ProjectOptions type
├── scaffold.ts       # Orchestrator: delegates to template generators
└── templates/
    ├── common.ts     # .gitignore, .env, README, .claude/settings.json
    ├── content.ts    # Sample content markdown files and globals
    ├── nextjs.ts     # Next.js config, krantho.config.ts, layouts, pages, API route
    ├── sveltekit.ts  # SvelteKit config, krantho.config.ts, routes, API endpoint
    ├── nextjs-static.ts      # the static site: package.json, configs, lib/krantho.ts
    ├── nextjs-static-app.ts  # its layout, pages and SEO file routes
    ├── static-content.ts     # its starter pages, README and GitHub Pages workflow
    └── static-css.ts         # its stylesheet
```

### Flow

1. Parse CLI args (optional project name: `create-krantho my-app`).
2. Run interactive prompts for framework, UI, auth, SEO, sample content.
3. Generate all files via `generateFiles()`, which delegates to template functions.
4. Write files to disk in the target directory.
5. Run package manager install (`pnpm`, `npm`, or `yarn` -- auto-detected).
6. Initialize a git repository with an initial commit.

## API Reference

### ProjectOptions

```typescript
interface ProjectOptions {
  name: string                              // Project directory name
  framework: 'nextjs' | 'sveltekit' | 'nextjs-static'  // Framework choice
  ui: 'tailwind' | 'mui' | 'plain'         // UI library (MUI only for Next.js)
  auth: boolean                             // Enable token-based auth
  seo: boolean                              // Include SEO components
  sampleContent: boolean                    // Generate sample markdown content
  packageManager: 'pnpm' | 'npm' | 'yarn'  // Auto-detected from npm_config_user_agent
  packageManagerSpec?: string               // 'pnpm@12.1.0', from the same user agent, when known
  port: number                              // Dev server port (default: 3000)
}
```

### generateFiles(options): Map<string, string>

Returns a map of relative file paths to file content strings. Delegates to:
- `generateCommonFiles(options)` -- .gitignore, .env, README, `.claude/settings.json`
- `generateContentFiles(options)` -- Sample content markdown and global config
- `generateNextjsFiles(options)` or `generateSveltekitFiles(options)` -- Framework-specific files
- `generateNextjsStaticFiles(options)` -- for `nextjs-static`, everything but the common files, in place of the content and framework files

### runPrompts(targetArg?): Promise<ProjectOptions>

Runs the interactive prompt sequence. If `targetArg` is provided (from CLI args), the project name prompt is skipped.

## Usage

### Quick Start

```bash
# Interactive mode
npx create-krantho

# With project name
npx create-krantho my-site

# Using pnpm
pnpm create krantho my-site
```

### Prompts

The CLI asks the following questions in order:

1. **Project name** (skipped if provided as argument) -- validates lowercase alphanumeric with hyphens/dots.
2. **Framework** -- Next.js (App Router, RSC), SvelteKit (Svelte 5, SSR), or a static site (Next.js, GitHub Pages). A static site skips the UI, authentication, SEO and sample content questions.
3. **UI library** -- Tailwind CSS, MUI (Next.js only), or Plain CSS.
4. **Authentication** -- Enable token-based auth (toggle, default: no).
5. **SEO components** -- Include `@krantho/seo` (toggle, default: yes).
6. **Sample content** -- Generate example markdown pages (toggle, default: yes).

### What Gets Generated

**Common files** (all projects):
- `.gitignore`, `.env`, `README.md`
- `.env` sets `PORT`, plus `KRANTHO_API_TOKEN` when auth is enabled
- `.claude/settings.json` -- shared Claude Code project settings

**Claude Code settings**: the generated `.claude/settings.json` registers the krantho plugin marketplace from GitHub under `extraKnownMarketplaces` (`"krantho": { "source": { "source": "github", "repo": "descoped/krantho" } }`) and turns its plugin on with `"enabledPlugins": { "krantho@krantho": true }`, so Claude Code sessions in the new project have the krantho skills from the start. Claude Code applies the marketplace only after the folder is trusted, and each person installs the plugin on their own machine the first time.

**Content directory**:
- `content/globals/` with navigation and footer globals
- `content/pages/` with a home page, plus an about page when sample content is enabled

**Both frameworks**:
- `package.json`, `tsconfig.json`
- `krantho.config.ts` -- site identity from `defineKranthoConfig()`, media on local disk (`media: { provider: 'local' }`, with `local.dir: 'static/uploads'` for SvelteKit), plus `auth: { mode: 'token' }` when auth is enabled
- `krantho.collections.ts` -- the `pages` and `globals` collections, shared by the API route and the page loader; with SEO chosen, the `pages` also declare the `seo` metadata group (`structuredDataMetadata`), where a page's own structured data is saved and edited in Data mode

**Next.js projects**:
- `next.config.ts`, `postcss.config.mjs` (Tailwind only)
- `lib/krantho.ts` -- registers `createContentLoader({ config, collections })` with `initServerLoader()`, so pages read the published version of each document from the database the API route opens; exports `requirePublished(collection, slug)` (404 via `notFound()` when nothing is published) and `globalFields(slug)` (a global's published fields, or none)
- `app/api/[...path]/route.ts` -- `createApiRouteHandlers({ config, collections })`
- `app/studio/[[...slug]]/route.ts` -- `createStudioRouteHandler({ config })`: Studio at `/studio`, the address the scaffolder tells you to open
- `app/layout.tsx` (reads no content), `app/(site)/layout.tsx` (navigation and footer globals, and a banner while an editor previews drafts), `app/(site)/[[...slug]]/page.tsx` (every page of the `pages` collection, `/` is `home`), `app/globals.css`
- `krantho.config.ts` sets `cache: { pages: 'next-isr' }`: the build renders no page, each page renders on its first request and stays cached until Studio changes it (see [server-next.md](server-next.md#cached-pages))
- The `dev` script is `next dev --port <port>`; Next.js loads `.env` itself

**SvelteKit projects**:
- `vite.config.ts` (SvelteKit and its adapter), `src/app.html`, `src/app.css`
- `src/lib/cms.ts` -- `loadContent(collection, slug)` reads the published version through `createContentLoader({ config, collections })` from `@krantho/server-sveltekit` and renders it with `renderContent()`; returns `{ fields, html }`, or `null` when nothing is published (the page answers 404)
- `src/routes/api/[...path]/+server.ts` -- `createApiHandlers({ config, collections })`
- `src/routes/studio/[...path]/+server.ts` -- `createStudioHandler({ config })`: Studio at `/studio`, the address the scaffolder tells you to open
- `src/routes/` layouts and pages (`+layout`, `+page`, `[slug]`)
- The `dev` script is `node --env-file-if-exists=.env node_modules/vite/bin/vite.js dev --port <port>`, because Vite does not load `.env` into `process.env` for server code

**Static sites** (`nextjs-static`): markdown in `content/docs` built to static files with `@krantho/static`, published by a GitHub Pages workflow. No database, API or Studio.
- `package.json` -- `@krantho/static`, `@krantho/ui-react`, `@krantho/seo`, `@krantho/config`, `@krantho/schema`, Next.js and React; `packageManager` when the scaffolder knows it, which `pnpm/action-setup` reads
- `krantho.config.ts` -- `persistence: { provider: 'filesystem' }`, `cache: { pages: 'none' }`, `seo: { identity: 'WebSite', collections: { docs: ['TechArticle'] } }`
- `krantho.collections.ts` -- the `docs` collection (`title`, `description`, `group`, `order`) at `path: '/:slug/'`: `index.md` is the home page
- `next.config.ts` -- `output: 'export'`, `trailingSlash: true`, `images.unoptimized`, `basePath` from `basePathOf(site.baseUrl)`, and `@krantho/static` and `@krantho/server` as server external packages
- `lib/krantho.ts` -- `createStaticSite()`, `initServerLoader(site.loader, { basePath })`, and `docLinks()`, the sidebar's reading order
- `app/layout.tsx` (header and grouped sidebar), `app/page.tsx` (the `index` page), `app/[slug]/page.tsx` (every other page, `dynamicParams = false`), `app/not-found.tsx` (`404.html`), `components/doc-page.tsx`, `app/globals.css`
- `app/sitemap.xml/route.ts`, `app/llms.txt/route.ts`, `app/robots.txt/route.ts` -- `force-static` routes over the site's builders
- `content/docs/index.md`, `writing.md`, `publishing.md`, and a README for writing and publishing
- `.github/workflows/pages.yml` -- checkout with the full history, install, `configure-pages`, build with `KRANTHO_SITE_BASE_URL` from its `base_url`, upload `out/`, deploy

CI builds a generated static site from the packed packages and checks its files (`scripts/check-packed-install.sh nextjs-static`, which runs `scripts/check-static-site.sh`).

### Post-Scaffold Output

```
Done! Your krantho project is ready.

  cd my-site
  npm run dev

Studio: http://localhost:3000/studio
API endpoint:    http://localhost:3000/api/content
```

## Dependencies

### Runtime Dependencies

| Package | Purpose |
|---------|---------|
| `prompts` 2.x | Interactive CLI prompts (select, toggle, text input) |

### Dev Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` 6.x | Type checking and compilation |
| `@types/prompts` | Type definitions for prompts library |
| `@types/node` | Node.js type definitions |
