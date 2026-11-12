# Getting Started Guide Template

Output: `docs/guides/getting-started.md`

For a developer going from zero to rendering content in 15 minutes.

## Structure

```markdown
# Getting Started

## Prerequisites
Node.js >=22.9.0, pnpm, a framework (Next.js or SvelteKit).

## Installation
Which @krantho packages for each use case (table), including `@krantho/config` for `krantho.config.ts`.

## Create Content
First markdown file with frontmatter. Explain the format.

## Configure the Loader
initServerLoader() with FileSystemAdapter. One code block.

## Render a Page
Minimal server component that loads and renders content.

## Add SEO
A `seo` section in `krantho.config.ts`, then `resolveSeoContent()` and
`<SeoJsonLd>` from `@krantho/ui-react/server` on a page.

## Development Workflow
Edit markdown, see changes. Dev server setup.
```

## Do

- Every step has one code block that works if pasted
- Show the file tree after setup is complete
- Link to package docs for API details

## Don't

- Don't explain every option — link to package docs
- Don't cover multiple frameworks in detail — pick Next.js as primary, note SvelteKit differences
