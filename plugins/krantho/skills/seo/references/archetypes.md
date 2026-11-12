# Archetypes in detail

## Contents

- The catalog
- The three seed shapes
- Field discovery
- System-derived properties
- What a page's graph looks like
- Editing after launch
- Code-defined archetypes

## The catalog

`@krantho/seo` ships a curated Schema.org catalog (`SCHEMA_CATALOG`), grouped as:

| Category | Examples |
|---|---|
| business | Organization, LocalBusiness, ProfessionalService, Restaurant |
| content | Article, BlogPosting, NewsArticle, FAQPage, HowTo, Recipe |
| commerce | Product, Service, Offer, Course |
| people | Person, Event, JobPosting |
| navigation | BreadcrumbList, WebSite, WebPage |
| reviews | Review, AggregateRating |

Each type says whether it applies at site level, document level or both, and which Google rich
result it enables. `GET /api/seo/catalog` returns it; Studio's type pickers use it.

```ts
import { getRequiredProperties, getTypeProperties } from '@krantho/seo'

getTypeProperties('Article') // [{ property: 'headline', importance: 'required', source: 'content' }, …]
getRequiredProperties('Article') // ['headline', 'author', 'datePublished']
```

Types with a dedicated builder (such as `LocalBusiness`, `Article`, `Service`, `FAQPage`)
produce cross-linked entities with `@id` references and read only the fields they name. Every
other catalog type uses a generic builder that merges the configured properties under its
`@type` and adds system-derived ones.

## The three seed shapes

```ts
seo: {
  // Thin: type lists
  identity: 'Organization',
  collections: { posts: ['BlogPosting'], docs: ['Article'] },
  routes: { '/docs/**': ['Article', 'BreadcrumbList'] },

  // Rich: entities with properties and field mappings
  site: {
    entities: [{ '@type': 'Organization', properties: { name: 'Example', logo: 'https://example.com/logo.png' } }],
  },
  richCollections: {
    services: {
      entities: [{ '@type': 'Service', properties: {} }],
      fieldMappings: { 'Service.description': 'ingress' },
    },
  },

  // File-based: a directory of YAML entities (see SKILL.md)
  configDir: './krantho.seo',
}
```

Use one shape per concern; the file-based seed suits sites whose SEO data is long or edited in
review. `fieldMappings` points a Schema.org property at a CMS field with another name.

Choose types from the catalog (`GET /api/seo/catalog`): its types carry the property
definitions, rich result requirements and builders the rest of the system relies on. Beyond the
groups above it covers types such as `SoftwareApplication`, `ProfilePage`, `QAPage`,
`DiscussionForumPosting`, `Dataset`, `VideoObject`, `ItemList` and several `LocalBusiness`
subtypes.

## Field discovery

krantho finds the fields that serve each SEO concept by name, highest priority first:

| Concept | Fields |
|---|---|
| title | `title`, `name` |
| description | `meta-description`, `description`, `ingress`, `excerpt` |
| author | `author` |
| datePublished | `published-date`, `date` |
| image | `og-image`, `image`, `hero-image` |
| canonical URL | `canonical-url` |
| Open Graph | `og-title`, `og-description`, `og-image` (then `image`) |
| sitemap exclusion | `robots-index` |

Name fields this way in the content model and most properties fill themselves.

## System-derived properties

For generic types the composition adds, when fields do not provide them: `datePublished` (first
version), `dateModified` (latest version), `inLanguage` (document locale), `author` (who created
it), `url` and `mainEntityOfPage` (`site.baseUrl` + the document path). `Article` takes
`datePublished` from a `date` field, points `author` at the site `Person`, and computes
`mainEntityOfPage` from the path.

## What a page's graph looks like

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "ProfessionalService", "@id": "https://example.com/#business", "name": "Example" },
    {
      "@type": "Article",
      "@id": "https://example.com/about/#article",
      "headline": "About us",
      "publisher": { "@id": "https://example.com/#business" },
      "mainEntityOfPage": "https://example.com/about"
    }
  ]
}
</script>
```

## Editing after launch

- Studio → Structure › Scopes & archetypes › Site entities: the site entities and their
  properties, with the `site` values from `krantho.config.ts` shown read-only beside them
  (From krantho.config.ts).
- Studio → Structure › Scopes & archetypes › Collection archetypes: the types per collection,
  with the impact on existing documents.
- Studio → the editor's Data mode: one page's composed graph, **Edit the graph** for its
  overrides, and its Open Graph and robots fields. A graph save reaches the live page at once:
  document SEO configuration has no versions.
- Through the API: `GET/PUT/DELETE /api/seo/config/<id>` with ids `site`, `collection:<name>`,
  `route:<pattern>`, `doc:<collection>/<slug>`; the body is `{ entities: [{ '@type', role?,
  properties }], fieldMappings? }`.

With cached pages, a document's SEO change refreshes that page at once; a site or collection
change marks the affected pages stale, refreshed as they are next visited.

## Code-defined archetypes

For a site that keeps SEO entirely in code, `composeGraph({ archetype, fields, config, path })`
with a preset (`homePageArchetype`, `blogPostArchetype`, `servicePageArchetype`, …) or
`defineArchetype({ schemas: [...], mappings })` composes a graph without the database. Render it
with `<JsonLd data={graph} />` from `@krantho/seo`, which escapes the JSON. Prefer the
configured archetypes when editors should be able to change SEO.
