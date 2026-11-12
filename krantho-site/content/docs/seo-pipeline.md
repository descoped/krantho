---
title: SEO pipeline
description: Generate Schema.org structured data, FAQ markup and llms.txt from YAML sources, enrich content with an LLM, and render the results in your app.
area: guides
order: 30
level: advanced
stacks: [next, sveltekit]
prerequisites: [add-seo, content-authoring]
next: [deploy-vercel]
related: [package-tools, package-seo, cli, configuration, studio]
status: published
---

The build-time SEO pipeline (`@krantho/tools`) turns YAML business data into Schema.org structured data, FAQ markup and `llms.txt`, and uses an LLM to enrich content. It runs alongside the runtime archetype system: archetypes are configured in `krantho.config.ts` and Studio, and pages render them with `resolveSeoContent()` and `<SeoJsonLd>`, which read in-process from the published version of each document — see [Add SEO](/docs/add-seo).

> [!NOTE]
> `@krantho/tools` is a private package, and its commands are scripts at the root of the krantho repository. The repository is private while krantho is in development; [Project status](/docs/project-status) explains how to work from source today.

## How it works

```text
YAML sources          Mappers              Generated files
business.yaml    -->  map-business    -->  structured-data.json
business.yaml    -->  map-llms-txt    -->  llms.txt
guardrails.yaml  -->  map-faq         -->  faq-pages.json
```

1. **Author.** You write `business.yaml` (Schema.org metadata) and `guardrails.yaml` (FAQ pairs) in `content/seo/`. The enrichment tools help with this.
2. **Map.** Deterministic mappers transform the YAML into Schema.org JSON. No AI is involved.
3. **Generate.** The mappers write the files to `paths.seoGeneratedDir` (default `content/seo/generated/`). You check these into version control.
4. **Render.** Your app reads the JSON, emits `<script type="application/ld+json">` tags and serves `llms.txt` — see [Use the generated files](#use-the-generated-files).

## Configuration

Create a `site-config.json` file in the `seo/` directory under your content directory (`paths.contentDir`, so `content/seo/site-config.json` by default). Only the `@krantho/tools` scripts read it; the CMS, API and Studio never do.

```json title="content/seo/site-config.json"
{
  "domain": "krantho.com",
  "siteName": "Krantho",
  "language": "en",
  "siteDescription": "Krantho, a CMS library for content sites built in your own codebase",
  "enrichSkipRoutes": []
}
```

That is krantho.com's own file. Every other key has a default, and the mappers use it when the site has the content it describes:

| Key | Default | Purpose |
|-----|---------|---------|
| `routeToSlug` | `{}` | Route to content slug, such as `{ "/": "home" }` |
| `appRoutes` | `[]` | Every route the FAQ entries map to |
| `servicesSlug` | `"services"` | The document in `content/pages/` whose sections describe the services offered |
| `serviceIds` | `[]` | The services to describe, by section name |
| `serviceFeeMapping` | `{}` | Service id to its row number in `content/pages/fees.md` |
| `priceCurrency` | `"USD"` | Currency of the offer prices |
| `addressCountry` | `"US"` | Country of the business address |

### business.yaml

Place this at `content/seo/business.yaml`. It holds business metadata for Schema.org that does not live in the CMS:

```yaml title="content/seo/business.yaml"
url: 'https://example.com'
geo: # the business's coordinates
  latitude: 0.0
  longitude: 0.0
area-served: 'The region you serve'
founding-year: 2020
legal-name: 'Example AS'
job-title: 'Founder'
credentials:
  - 'A certification the founder holds'
knows-about:
  - 'Web development'
  - 'Structured data'
prose:
  summary: 'Example AS builds and runs websites...'
```

The mappers describe a local business and the person behind it. krantho.com has no `business.yaml`: it is not a local business, and its structured data comes from the runtime archetype system, seeded from its `krantho.seo/` directory.

### Content the mappers read

Besides the YAML, the mappers read three documents in `content/pages/` by slug:

| Document | Keys |
|----------|------|
| `contact` | `footer-title` (the business name), `phone-number`, `email-address`, `location-title` (street address), `location-address` (postal code and city), `hours-line1` and `hours-line2` (opening hours), `footer-license` (a credential line in `llms.txt`) |
| `fees` | `description`, numbered rows `service-N-name`, `service-N-duration-J` and `service-N-price-J`, and `payment-text`, `insurance-text`, `cancellation-text` |
| the `servicesSlug` document | `<id>-title` and `<id>-ingress` per service id, used when `business.yaml` lists no `services` |

The structured data takes each service's first price and duration, from the fee row `serviceFeeMapping` names.

## Generation commands

Run the mapper pipeline to produce the output files. The scripts are root scripts of the krantho repository and pass `--root examples/nextjs-shadcn`. Add your own `--root <dir>` to point them at another project — the last one wins, as in `pnpm run seo:generate --root path/to/site`.

```bash
# Preview without writing
pnpm run seo:generate:dry

# Generate output files
pnpm run seo:generate
```

This writes three files to `content/seo/generated/`:

- **`structured-data.json`** — ProfessionalService (a LocalBusiness subtype) and Person Schema.org entities, built from `business.yaml` and the `contact`, `fees` and services documents (see [Content the mappers read](#content-the-mappers-read)).
- **`llms.txt`** — the site's `llms.txt` for AI assistants, built from `business.yaml` and your content, with the link descriptions `seo:enrich:llms` writes.
- **`faq-pages.json`** — FAQ entries per route, built from `guardrails.yaml`. Questions inherit: those on `/docs` with `inherit: true` also appear on child routes such as `/docs/installation`.

## Enrichment commands

The enrichment tools use the LLM provider from your `krantho.config.ts` (through `@krantho/ai`) to generate or validate content. The API key is the provider's own: `KRANTHO_LLM_ANTHROPIC_API_KEY` in the environment for the default provider (each provider reads its own variable), or `llm: { anthropic: { apiKey } }` in the config file. The `claude-code` provider instead runs on `KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN` — the Claude subscription token `claude setup-token` prints, for development on your own machine, with Haiku only — and no API key; no other provider reads it. The scripts do not load `.env`, so export the credential in the shell.

All tools share the same interface:

- **Dry run by default** — preview without writing.
- **`--apply`** — write changes to disk.
- **`--concurrency N`** — limit parallel calls; otherwise `tools.concurrency` from the config.
- **`--root DIR`** — run against another project; otherwise the working directory.

### FAQ enrichment

```bash
pnpm run seo:enrich:faq            # Preview
pnpm run seo:enrich:faq --apply    # Write to guardrails.yaml
```

It runs three passes: a backup, a check of existing answers against current facts, then new questions for pages with fewer Q&A pairs than `tools.enrich.faqMinPerRoute` (default 5). After enrichment, run `pnpm run seo:generate` to update `faq-pages.json`.

### Service descriptions

```bash
pnpm run seo:enrich:services            # Preview
pnpm run seo:enrich:services --apply    # Write to business.yaml
```

Generates a one- or two-sentence description for each service in your Schema.org OfferCatalog. Services that already have a description are skipped.

### llms.txt descriptions

```bash
pnpm run seo:enrich:llms                         # Preview
pnpm run seo:enrich:llms --apply                 # Write to business.yaml
pnpm run seo:enrich:llms --apply --regenerate    # Overwrite all
```

Generates two- to four-sentence descriptions written for AI assistants. Descriptions stop at `tools.enrich.llmsDescriptionCap` characters (default 300) and end on a complete sentence.

### Meta descriptions

```bash
pnpm run seo:enrich:meta                    # Preview
pnpm run seo:enrich:meta --apply            # Write to content files
pnpm run seo:enrich:meta --apply --force    # Overwrite existing
```

Generates `meta-description` frontmatter fields, between `seo.enrichment.meta.minChars` and `maxChars` (default 120–155 characters), for page-level and section-level content. It writes directly to your `.md` files.

## Use the generated files

Read the generated JSON on the server with `loadSeoJson()` from `@krantho/core/seo`. It reads from `content/seo/generated/` under the working directory unless you pass a directory, and returns `null` when the file is missing:

```tsx title="app/layout.tsx"
import { loadSeoJson } from '@krantho/core/seo'
import { JsonLd } from '@krantho/seo'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const structuredData = loadSeoJson('structured-data.json')
  return (
    <html lang="en">
      <body>
        {structuredData && <JsonLd data={structuredData} />}
        {children}
      </body>
    </html>
  )
}
```

`<JsonLd>` serializes the data into a `<script type="application/ld+json">` tag and escapes it against XSS. The running API also serves the file at `GET /api/seo/structured-data`.

`loadSeoJson()` reads a file, not the database, so it is safe in a root layout: the build can read it. `loadSeoText()` reads a text file the same way. Serve `llms.txt` from a route handler:

```ts title="app/llms.txt/route.ts"
import { loadSeoText } from '@krantho/core/seo'

export function GET(): Response {
  const content = loadSeoText('llms.txt')
  if (!content) return new Response('llms.txt not generated', { status: 404 })
  return new Response(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
```

The generated files ship with your deployment. After you run `seo:generate` again, redeploy to publish them.

In SvelteKit, `@krantho/ui-svelte` provides `JsonLd`, `FAQSchema` and `BreadcrumbJsonLd` components that take the data as props.

## Next steps

- [Add SEO](/docs/add-seo) — the runtime archetype system most sites start with.
- [@krantho/tools](/docs/package-tools) — every script and option.
- [Studio](/docs/studio#structure) — enrich documents at runtime with **Fill what's missing** in Structure.
