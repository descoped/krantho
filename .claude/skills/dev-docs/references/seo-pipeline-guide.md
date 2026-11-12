# SEO Pipeline Guide Template

Output: `docs/guides/seo-pipeline.md`

Before writing, read: `packages/seo/src/`, `packages/seo-shared/src/`, `packages/api/src/handlers/seo-*.ts`, `packages/ui-react/src/server/`, `packages/tools/src/seo/`, `packages/tools/src/shared/site-config.ts`, `examples/content/seo/`.

## Structure

```markdown
# SEO Pipeline

## Overview
Archetype system (primary): `seo` section of `krantho.config.ts` → seo_config
table → `composeFromConfig()` → `resolveSeoContent()` / `<SeoJsonLd>`.
Legacy pipeline: agent-authored YAML → deterministic mappers → generated JSON.
Diagram of both flows.

## Configuration
site-config.json: what each field controls.
business.yaml: structure and what maps where.

## Generation
What each command produces:
- seo:generate → structured-data.json, faq-pages.json
- What the mappers do (map-business, map-faq, map-llms-txt)

## Enrichment
How LLM enrichment works (via `@krantho/ai`):
- enrich:faq — validate + generate Q&A
- enrich:services — service descriptions
- enrich:llms — llms.txt descriptions
- enrich:meta — page meta descriptions
Concurrency, dry-run vs apply, backup behavior.

## Frontend Integration
- `resolveSeoContent()` in `generateMetadata`
- `<SeoJsonLd collection slug />` on each page
- Legacy JSON: `loadSeoJson()` from `@krantho/core/seo` + `<JsonLd>`
```

## Do

- Show the actual CLI commands
- Explain what each generated file contains
- Show where the SEO helpers go in a Next.js page

## Don't

- Don't explain adapter internals — reference the @krantho/ai and @krantho/tools docs
- Don't duplicate the full site-config.json schema — link to tools doc
