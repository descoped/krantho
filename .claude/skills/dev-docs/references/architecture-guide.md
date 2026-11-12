# Architecture Overview Guide Template

Output: `docs/guides/architecture.md`

Before writing, read: CLAUDE.md, all `packages/*/package.json`, key `src/index.ts` files.

## Structure

```markdown
# Architecture Overview

<Two sentences: what krantho is, what it's for.>

## Concept

The problem krantho solves. How it differs from headless CMS platforms,
static site generators, and raw markdown files. The mental model.

## Package Map

Dependency graph showing all packages and their relationships.
One-line description per package. Which packages a typical project installs.

## Content Flow

End-to-end trace: markdown file → persistence adapter → content engine →
React/Svelte component → rendered HTML in browser.

Cover SSG, SSR, and ISR rendering modes.

## Design Decisions

Why a workspace monorepo. Why no adapter layer. Why persistence is a
separate interface. Why UI packages are parallel alternatives.

Each decision: what was chosen, what was rejected, why.

## Extension Points

Where consumers customize:
- Persistence adapters (filesystem, Postgres, custom)
- Semantic CSS classes (style however you want)
- Content schema (frontmatter key conventions)
- SEO pipeline configuration (site-config.json)
```

## Do

- Include the actual package dependency graph from CLAUDE.md
- Trace a real content file through the system
- Explain decisions, not just describe structure

## Don't

- Don't list every API — that's what package docs are for
- Don't describe internal implementation — focus on concepts
