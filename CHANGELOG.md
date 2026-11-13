# Changelog

Every krantho release, newest first. Versions follow [semver.org](https://semver.org); a release's tag is
`vMAJOR.MINOR.PATCH`.

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
