# Changelog

Every krantho release, newest first. Versions follow [semver.org](https://semver.org); a release's tag is
`vMAJOR.MINOR.PATCH`.

## 1.1.1 - 2026-11-14

### Added

- A collection's `indexFile` names the file read as its `index` document, such as `README.md`, the file GitHub
  shows for a folder. `index.md` is then not read.
- `createStaticSite()` returns `site.rendering` (`basePath`, `resolveUrl`, `atNotation`) for `initServerLoader()`.
  Relative links between markdown files (`setup.md#install`) go to their pages, and files beside them
  (`images/flow.png`) are served from the site's root. `createLinkResolver()` builds the same resolver.
- `renderContent()` and `MarkdownProcessor` take `resolveUrl`, and `initServerLoader()` takes `resolveUrl` and
  `atNotation`.

### Changed

- The `src` and `href` of raw `<img>` and `<a>` tags in markdown are rewritten as markdown links are, for the
  base path and the resolver.
- A static site's pages follow `content.atNotation`.
- The static starter writes no `.env`, and wide tables scroll on their own.

## 1.1.0 - 2026-11-13

### Added

- `@krantho/static`: a site built from its markdown to static files, for GitHub Pages or any file host.
  `createStaticSite()` gives the read loader, the pages to write (`params()`), `sitemapXml()`, `llmsTxt()`,
  `robotsTxt()` and the base path from `site.baseUrl`; `@krantho/static/base-path` exports `basePathOf()` for
  `next.config.ts`.
- `create-krantho` has a third choice, "Static site (Next.js, GitHub Pages)": a docs site with a grouped sidebar,
  a static export under the path Pages serves it at, and a GitHub Pages workflow.
- `@krantho/api` exports the sitemap, robots.txt and llms.txt builders, which take a `SeoFileSource` instead of a
  request.
- `renderContent()` and `initServerLoader()` take a `basePath`: root-relative links and images in markdown get it.

### Fixed

- On the filesystem provider, pages compose the structured data the `seo` section configures, held in memory;
  before, they fell back to the blog-post archetype with no site entities.
- The filesystem adapter dates each file by its last git commit (`dateOf`), so publish dates and the sitemap's
  `lastmod` no longer change with each checkout.
- Every package that depends on `glob` resolves 14.0.2 or later.

## 1.0.2 - 2026-11-13

### Fixed

- A content file removed from the repository deletes its document on the next deploy, unless an editor changed the
  document in Studio; a collection directory without files deletes nothing, and a checkpoint is taken first.
  Before, deleted and renamed files left their pages live and in the sitemap.
- `create-krantho` allows `better-sqlite3`'s native build under pnpm 10 (`onlyBuiltDependencies`) and pnpm 11+
  (`allowBuilds`), so a scaffolded pnpm project builds SQLite.

### Changed

- SvelteKit 3: the scaffolder and examples configure SvelteKit in its Vite plugin; `@krantho/ui-svelte` publishes a
  compiled `dist/`.
- postgres.js 4 is the supported Postgres client (`@krantho/server`'s peer range).
- Every dependency and tool is at its latest version: pnpm 12, TypeScript 7 (6 for the SvelteKit packages),
  Vitest 5, Node 26.

## 1.0.1 - 2026-11-13

### Fixed

- Next.js sites installed from npm start: `@krantho/server-next` imports `next/server`, `next/cache` and
  `next/headers` with their file extension, which Node's resolver needs when Next loads the package as an external.
  In 1.0.0 every page, the API and Studio answered 500.
- Studio is found under every package manager: `@krantho/server` depends on `@krantho/studio` and resolves it from
  its own dependencies, so `/studio` loads under pnpm's strict layout.

### Changed

- Every published package has a description, and packages are published through npm trusted publishing, with
  provenance.
- Dependencies are updated to their patched versions.

## 1.0.0 - 2026-11-12

The first public release, and the first on npm. Krantho grew through 0.x releases in a private repository; this
entry gathers what they built, and the changelog starts here.

### Added

- Content templates defined in code: a collection is a Zod schema, its documents are markdown with frontmatter.
  Code-defined fields are read-only; runtime fields extend them.
- Content in the repository: a new database imports the markdown, and every deploy imports new and changed files
  without overwriting an editor's change. Edits made in production come back to the repository as a branch.
- Drafts, publishing that promotes a saved version, append-only version history, edit locks, locales, and metadata
  (SEO included) versioned with each page.
- A media library with folders, tags, crop, hotspots and an image optimizer serving sized WebP and AVIF.
- Studio, the dashboard for editors, served at `/studio` by `@krantho/studio` on Next.js, SvelteKit and Express:
  Pulse, Site, Structure, Media and Setup; Live, Structure and Data modes; preview on the site; an assistant chat.
- Structured SEO: archetypes at site, collection, route and document scope composed into one JSON-LD graph,
  checked against Schema.org and search engine rules, with meta tags, Open Graph, sitemap, `robots.txt`,
  `llms.txt` and IndexNow.
- Enrichment of meta descriptions and Schema.org properties by a language model through `@krantho/ai`
  (Anthropic, OpenAI, Gemini, OpenRouter, Ollama), never overwriting an editor's values.
- Persistence on SQLite and Postgres with automatic migrations; media on local disk, Vercel Blob, S3-compatible
  stores and Google Cloud Storage.
- Page caching with Next.js ISR, optionally shared across instances, or at a CDN (CloudFront, Cloud CDN, Vercel)
  purged by tag; pages read the published version in-process.
- One typed configuration from `krantho.config.ts` and the environment.
- A REST API with an OpenAPI 3.1 specification, plugins, webhooks with retries, and sign-in by token or OpenID
  Connect; CI jobs sign in with their platform identity.
- One-install bundles per framework (`@krantho/next`, `@krantho/sveltekit`, `@krantho/node`), UI packages for
  React, MUI, Tailwind and Svelte, the `krantho` command-line tool, the Claude Code plugin with its skills, and
  the `create-krantho` scaffolder.
