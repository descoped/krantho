# Changelog

Every krantho release, newest first. Versions follow [semver.org](https://semver.org); a release's tag is
`vMAJOR.MINOR.PATCH`.

## 1.0.0 - 2026-11-12

The first release, and where this changelog starts.

### Added

- Content templates defined in code: a collection is a Zod schema, its documents are markdown with frontmatter.
- Studio, the dashboard for editors, served at `/studio` by `@krantho/studio` on Next.js, SvelteKit and Express.
- Drafts, publishing, version history, editing locks, locales and a media library.
- Structured SEO: archetypes at site, collection, route and document scope composed into one JSON-LD graph, with
  meta tags, sitemap, `robots.txt` and `llms.txt`, and optional enrichment by a language model.
- Persistence on SQLite and Postgres; media on local disk, Vercel Blob, S3-compatible stores and Google Cloud Storage.
- Page caching with Next.js ISR or a CDN (CloudFront, Cloud CDN, Vercel).
- A REST API with an OpenAPI 3.1 specification, plugins, webhooks, and sign-in by token or OpenID Connect.
- The `krantho` command-line tool, the Claude Code plugin with its skills, and the `create-krantho` scaffolder.
