---
name: seo
description: >
  Sets up and improves SEO and answer-engine visibility for a krantho site: Schema.org structured
  data through krantho's archetype system (site, collection, route and document scopes), meta
  tags and Open Graph, JSON-LD in pages, the sitemap and robots.txt, llms.txt, validation of rich
  result eligibility, and filling meta descriptions and Schema.org properties with a language
  model through @krantho/ai (Anthropic by default, or OpenAI, Gemini, OpenRouter, Ollama). Use
  when asked about SEO, structured data, JSON-LD, rich results, meta descriptions, Open Graph,
  sitemaps, llms.txt, AEO, or configuring the LLM a krantho site uses for enrichment.
compatibility: krantho 0.1.x; Claude Code
metadata:
  krantho-version: 1.0.0
  docs: https://krantho.com/docs/add-seo
---

# SEO for krantho sites

## Contents

- Workflow
- Seed the configuration
- Scopes
- Page output
- Sitemap, robots.txt and llms.txt
- Validate
- Rules

krantho keeps SEO separate from content: a site works without it, and SEO settings live in
their own store (the `seo_config` table), edited in `/studio` under Structure (and per page in the editor's Data mode). It has four parts:

1. **Archetypes** — which Schema.org types the site and each page publish, configured at four
   scopes and composed into one JSON-LD `@graph` per page.
2. **Page output** — `resolveSeoContent()` for the title, description, Open Graph and Twitter
   tags; `<SeoJsonLd>` for the graph. Both read in-process: the published version's fields, plus
   the document's SEO configuration, which has no versions and applies at once.
3. **Delivery** — `/api/seo/sitemap`, `/api/seo/robots.txt`, and optionally `llms.txt`.
4. **Enrichment** — a language model fills missing meta descriptions and Schema.org properties
   without overwriting what people wrote.

## Workflow

1. **Decide the identity and the page types.** What is the site (the `identity`: an
   `Organization`, a `LocalBusiness` subtype such as `ProfessionalService` or `Restaurant`, a
   `Person`)? What does each routed collection publish (`Article`, `BlogPosting`, `Service`,
   `Product`, `Event`, `FAQPage`, `HowTo`, `Course`, `JobPosting`…)? Prefer types with a Google
   rich result where they honestly apply; never mark up content that is not on the page.
2. **Seed the configuration in code** (below). Editors refine it in Studio afterwards.
3. **Render it** in every page template: `generateMetadata` from `resolveSeoContent`, and
   `<SeoJsonLd collection slug />` in the page body. Details:
   `${CLAUDE_SKILL_DIR}/references/archetypes.md`.
4. **Deliver** the sitemap and robots.txt (rewrites or routes to the API) and set
   `KRANTHO_SITE_BASE_URL` per deployment.
5. **Fill the gaps** with enrichment, after a language model is configured:
   `${CLAUDE_SKILL_DIR}/references/enrichment.md`.
6. **Validate** (below), and check a few pages in Google's Rich Results Test once deployed.

## Seed the configuration

```ts
// krantho.config.ts
export default defineKranthoConfig({
  site: { domain: 'example.com', name: 'Example', language: 'en', baseUrl: 'https://example.com' },
  seo: {
    identity: 'ProfessionalService',
    collections: { pages: ['WebPage'], services: ['Service'], posts: ['BlogPosting'] },
    routes: { '/services/*': ['Service', 'FAQPage'] },
  },
})
```

- Seeded on startup. With the default `seedMode: 'seed'`, rows already in the database are kept,
  so Studio edits survive restarts; `'overwrite'` (`KRANTHO_SEO_SEED_MODE`) replaces them.
- For properties (name, address, opening hours, logo) use the rich shape (`seo.site`,
  `seo.richCollections`, `seo.richRoutes`) or a seed directory, `seo: { configDir: './krantho.seo' }`:

```
krantho.seo/
  site/professional-service.yaml       # site-scope entities
  site/website.yaml
  collections/<collection>/<type>.yaml # collection-scope entities
  documents/<collection>/<slug>.yaml   # per-document overrides
  routes/<encoded-pattern>.yaml        # URL-pattern overrides
```

```yaml
# krantho.seo/site/professional-service.yaml
"@type": ProfessionalService
role: primary
properties:
  name: Example
  telephone: "+1 555 0100"
  address:
    "@type": PostalAddress
    addressLocality: Springfield
    addressCountry: US
```

## Scopes

| Scope | Config id | Holds |
|---|---|---|
| Site | `site` | the identity entities (business, WebSite, founder Person) |
| Collection | `collection:<name>` | the default types of a collection's documents |
| Route | `route:<pattern>` | overrides for a URL pattern (`/services/*`, `/docs/**`) |
| Document | `doc:<collection>/<slug>` | one page's overrides and generated properties |

Document overrides route, route overrides collection; entities with the same `@type` (and
`role`) merge property by property. Site entities are added to every page's graph and linked by
`@id`. Many properties fill themselves: `title` → `headline`/`name`, `meta-description` or
`description` → `description`, `date` → `datePublished`, `og-image`/`image` → `image`, and for
types without a dedicated builder also `dateModified`, `inLanguage` and `url` from the version
history. Authors fill only what needs judgment.

A document's URL in the graph is its route by krantho's convention (`/<slug>` for `pages`,
`/<collection>/<slug>` otherwise), or its `route` field when set.

## Page output

```tsx
export async function generateMetadata(): Promise<Metadata> {
  const seo = await resolveSeoContent('services', slug)
  return {
    title: seo.title,
    description: seo.description,
    alternates: seo.canonical ? { canonical: seo.canonical } : undefined,
    openGraph: seo.og && { title: seo.og.title, description: seo.og.description, type: seo.og.type,
      images: seo.og.image ? [seo.og.image] : [] },
  }
}
// in the page: <SeoJsonLd collection="services" slug={slug} />
```

Values come from the document's SEO properties first, then its fields, then the site defaults.
Each page renders its own complete graph; the layout renders none. On SvelteKit and Express,
the content loader's `jsonLd({ collection, slug })` returns the graph and the page writes it
into the head, escaping `<` as `<`.

## Sitemap, robots.txt and llms.txt

- **Sitemap:** `/api/seo/sitemap` lists `/` and the live version of every document outside
  `globals`, at its conventional path; documents with `robots-index: false` are left out. Map
  `/sitemap.xml` to it (a Next.js rewrite, or a route that proxies it with `Cache-Control:
  no-cache` behind a CDN).
- **robots.txt:** `/api/seo/robots.txt`, with an override editable in Studio (Structure ›
  Crawlers & assistants), stored as `robotsTxt` on the site's SEO configuration; it references
  the sitemap.
- **llms.txt:** a plain-text guide to the site for AI assistants, generated by the build-time
  pipeline and served from a route. See `${CLAUDE_SKILL_DIR}/references/build-pipeline.md`.

## Validate

- **In Studio:** the editor's Data mode checks each page (title and meta description against
  the site's limits, body, headings, links), shows its composed graph with the source of each
  value, its rich results and each search engine's findings; Structure › Graph shows a live
  page's graph as served, and Structure › Rich results each search feature across the site.
- **Over HTTP:** `GET /api/seo/preview/<collection>/<slug>` returns the JSON-LD graph a document
  composes to; `GET /api/seo/status` the SEO status across collections.
- **In code:** `validateRichResult(type, properties)` and `getRichResultRequirements(type)` from
  `@krantho/seo` report missing required and recommended properties.
- **CLI (from a krantho checkout, SQLite sites):** `pnpm run seo validate --all`,
  `pnpm run seo preview <collection>/<slug>`, `pnpm run seo config show` — add
  `--root <path-to-site>` to point at your project. The tools package is not published.
- **After deploy:** Google's Rich Results Test and Search Console on a sample of page types.

## Rules

- Mark up only what the page shows. FAQ markup needs the questions and answers on the page.
- One identity for the site; do not declare a business type on every page by hand.
- Keep `meta-description` 120–155 characters, specific to the page, written for people.
- Never overwrite an author's text with generated text without showing them; enrichment
  already skips filled values unless forced.
- Keep SEO configuration in the seed or Studio, never hard-coded JSON-LD in templates, except
  for page-local structures such as an FAQ list rendered from a collection.
