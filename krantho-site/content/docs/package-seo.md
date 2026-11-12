---
title: "@krantho/seo"
description: Schema.org structured data composed into one cross-linked JSON-LD graph, checked against the vocabulary and each search engine's published rules.
area: reference
order: 109
level: advanced
prerequisites: [add-seo]
related: [seo-pipeline, package-ui-react, package-studio, configuration]
status: published
---

Generate Schema.org structured data that conforms to the vocabulary. The package composes JSON-LD `@graph` blocks with cross-linked entities, checks them against a pinned Schema.org release and the rules each search engine publishes, and renders them safely into a `<script>` tag.

## Install

> [!NOTE]
> Krantho is in active development and its packages are not on npm yet. The command below is the one the first release will use. To run krantho today, see [Project status](/docs/project-status).

```bash
pnpm add @krantho/seo
```

Peer dependency: `react >= 19.0.0`.

## Render SEO on a page

In a krantho site you rarely call this package from a page. The archetypes you configure (in `krantho.config.ts` and Studio) are stored as SEO configuration, and pages render them through [@krantho/ui-react](/docs/package-ui-react): `resolveSeoContent()` for meta tags and `<SeoJsonLd>` for the JSON-LD graph. Both read in-process through the content loader, from the published version of each document, and the loader composes the graph with `composeFromConfig()` (see [Config-driven](#config-driven)). No page calls the site's own API. [Add SEO](/docs/add-seo) walks through the setup.

The components and functions below are for composing structured data yourself, outside the stored configuration.

## Render structured data

`SEOGraph` renders a JSON-LD `<script>` tag with a composed `@graph`. Pick an archetype that matches your page type.

```tsx
import { SEOGraph, homePageArchetype } from '@krantho/seo'

<SEOGraph
  archetype={homePageArchetype}
  fields={content.fields}
  config={{
    domain: 'example.com',
    name: 'My Site',
    language: 'en',
    baseUrl: 'https://example.com',
  }}
  path="/"
/>
```

This renders one `<script type="application/ld+json">` tag containing a `@graph` array of cross-linked entities.

## Built-in archetypes

| Archetype | Schema.org types |
|-----------|-----------------|
| `homePageArchetype` | LocalBusiness, Person, WebSite |
| `aboutPageArchetype` | Organization, Person, BreadcrumbList |
| `servicePageArchetype` | LocalBusiness, BreadcrumbList, FAQPage, Service |
| `blogPostArchetype` | Article, BreadcrumbList, Person |
| `eventPageArchetype` | Event, BreadcrumbList, Organization |
| `recipePageArchetype` | Recipe, BreadcrumbList, Person |
| `coursePageArchetype` | Course, BreadcrumbList, Organization |
| `jobPostingPageArchetype` | JobPosting, BreadcrumbList, Organization |
| `howToPageArchetype` | HowTo, BreadcrumbList, Person |
| `videoPageArchetype` | VideoObject, BreadcrumbList, Organization |

## Custom archetypes

`defineArchetype` creates your own archetype. Every schema type is checked against the catalog.

```ts
import { defineArchetype } from '@krantho/seo'

const productPage = defineArchetype({
  schemas: ['Product', 'BreadcrumbList', 'Organization'],
  mappings: {
    price: 'offers',
    sku: 'sku',
  },
})
```

Default field mappings apply on their own: `title` maps to `name`, `description` to `description`, `author` to `author`, and so on.

## Page structure and FAQ

A page knows what it renders: the trail of its breadcrumb, its place in an ordered set, what kind of page it is. Pass the same values to the graph as `structure`, so the structured data says what the page shows.

```tsx
import { defineArchetype, SEOGraph } from '@krantho/seo'

// A docs page: the article and its questions
const docsPageArchetype = defineArchetype({ schemas: ['Article', 'FAQPage'] })

<SEOGraph
  archetype={docsPageArchetype}
  fields={content.fields}
  config={siteConfig}
  path="/docs/installation"
  structure={{
    trail: [
      { name: 'Docs', url: '/docs' },
      { name: 'Get started', url: '/docs#area-get-started' },
      { name: 'Installation' },
    ],
    sequence: { partOf: { name: 'Get started', url: '/docs#area-get-started' }, position: 2 },
  }}
  faq={[
    { question: 'Can I install krantho from npm?', answer: 'Not yet. Krantho is in active development and runs from source today.' },
  ]}
/>
```

Every graph gets a page node: a `WebPage` (or the type `kind` names: `item`, `collection`, `about`, `faq`, `profile`, or a Schema.org WebPage type) that is part of the WebSite and has the document's entity as its main entity. A `trail` becomes a BreadcrumbList linked from the page; relative URLs resolve against the site's base URL, and the last step links to the page. A `sequence` states the set the page is part of and its position in it. The FAQ is rendered only when the archetype includes `FAQPage`.

Pages that render through the content loader pass the same object to `<SeoJsonLd>`:

```tsx
<SeoJsonLd collection="docs" slug={slug} structure={structure} />
```

A collection can give its pages a trail and a kind when their template states none, in `_structure.yaml` beside its entity files: the trail lists the steps above the page, and the page is added.

```yaml title="krantho.seo/collections/docs/_structure.yaml"
trail:
  - name: Docs
    url: /docs
```

## Graph composition

There are two ways to compose a graph.

### Archetype-driven

Use `composeGraph` when you have a static archetype and page fields.

```ts
import { composeGraph, blogPostArchetype } from '@krantho/seo'

const graph = composeGraph({
  archetype: blogPostArchetype,
  fields: { title: 'My Post', description: 'A blog post' },
  config: { domain: 'example.com', name: 'Blog', language: 'en', baseUrl: 'https://example.com' },
  path: '/blog/my-post',
})
```

### Config-driven

Use `composeFromConfig` when the SEO configuration is stored in the database (through Studio). The API's SEO preview composes a page's JSON-LD with it, and so does the content loader that server-rendered pages read through (`createContentLoader()` from the server adapters), in-process.

```ts
import { composeFromConfig } from '@krantho/seo'

const graph = composeFromConfig({
  config: documentConfig,
  fields: content.fields,
  siteConfig: { domain: 'example.com', name: 'My Site', language: 'en', baseUrl: 'https://example.com' },
  path: '/about',
  siteLevel: siteSeoConfig, // the site-scope SeoConfigData (identity entities), or null
  documentMeta: { createdAt: '2024-01-15', locale: 'en', version: 1 },
})
```

Each property's value comes from one source, in this order:

1. The entity's SEO settings, from Studio or the definition files.
2. A content field: a field mapping, a field named after the property, or a field the type reads under another name (`title` for an Article's `headline`).
3. A value computed from the page: `url` and `mainEntityOfPage` from the path, `datePublished` and `dateModified` from version history, `inLanguage` from the locale.
4. The site's identity from `krantho.config.ts`: an organization's name, URL, logo, description, alternate name and profile links.

An entity carries only properties its type defines, so internal fields such as `status` or `order` stay out of the JSON-LD. References resolve within the graph: an Article's `author` is the site's Person, or the publishing Organization when no Person is configured. An `author` never comes from who last edited the page.

`resolveEffectiveConfig({ collection, route, document })` merges the document-level scopes into the `config` you pass: entities are matched across scopes, and the more specific scope wins per property. Each merged entity records, in `scopes`, which scope gave each of its properties. That record is not stored.

`resolvePageEntities()` takes the same options as `composeFromConfig` and returns what every entity resolves to, as an editor sees it: each property's `value`, its `source`, where it was read (`origin`), whether the SEO settings may set it (`editable`), and its `scope`:

| `scope` | The value comes from |
|---------|----------------------|
| `site` | The site's identity, or the site-level SEO settings |
| `collection` | The collection's SEO settings |
| `route` | The SEO settings of the URL pattern that matches the page |
| `document` | The document: its own SEO settings, or a content field |
| `computed` | krantho, from the page and its history |
| `linked` | A reference to another entity in the graph |

Studio shows the same view — in the editor's Data mode and in **Structure › Graph** — through `GET /api/seo/resolved/:collection/:slug`.

## Schema catalog

Query the curated catalog of Schema.org types relevant to SEO.

```ts
import { getCatalogType, getCatalogByCategory, getSiteLevelTypes } from '@krantho/seo'

getCatalogType('Article')            // type details, rich result info
getCatalogByCategory('content')      // all content-related types
getSiteLevelTypes()                  // types for site-level entities
```

## Validation

`validateGraph` checks a graph against the Schema.org release the package pins and, with `profiles`, against each search engine's published rules.

```ts
import { validateGraph } from '@krantho/seo'

const findings = validateGraph(graph, { profiles: ['google', 'bing'] })
// [{ severity: 'warning', code: 'profile-required', profile: 'google', type: 'Event',
//    property: 'startDate', message: 'Event needs "startDate" for Google\'s Event.',
//    source: 'https://developers.google.com/search/docs/appearance/structured-data/event' }]
```

Errors make the markup invalid: a reference no node defines, a duplicate `@id`, a type or property Schema.org does not have, has superseded or has retired, a value the property does not accept. A property a search engine's feature needs is a warning — the page is valid, but not eligible for that feature — and a recommended one is information.

Each search engine's rules are a reader profile: per type, the feature, whether it is active, restricted or retired, the properties it needs and recommends, the documentation the rule comes from and the date it was checked. `google` and `bing` are built in; `seo.readers` in `krantho.config.ts` chooses which ones a site is checked against. Types whose feature a reader has retired, such as Google's HowTo, are no longer offered in Studio's type pickers.

```ts
import { getProfile, ruleFor } from '@krantho/seo'

ruleFor(getProfile('google')!, 'NewsArticle')
// { type: 'Article', feature: 'Article', status: 'active', source: '…', verifiedAt: '2026-10-02', … }
```

`featureEligibility(graph, readers)` lists the search features a page's entities can appear in: one entry per top-level entity whose type has a reader rule for a feature that reader still shows, with `reader`, `feature`, `type`, `nodeId`, `status` (`active` or `restricted`), `eligible`, `missing`, `conditions` and `source`. `eligible` is true when the feature is active and the entity has every property it needs; `missing` names what it lacks, with a choice written as `a | b`. A feature the reader has retired is never listed. The subsystem offers it for the site's own readers as `seo.features(graph)`, and `GET /api/seo/findings` reports it for every published page.

```ts
import { featureEligibility } from '@krantho/seo'

featureEligibility(graph, ['google'])
// [{ reader: 'google', feature: 'Event', type: 'Event', status: 'active', eligible: false, missing: ['startDate'], … }]
```

## Checked at start and before a build

The server creates the SEO subsystem from the site's configuration when it starts (`createSeo`), and refuses to start when a configured type is unknown or retired, a reader is not registered, or a reader requires an identity value the configuration lacks. The error names the setting and its environment variable. A value a reader recommends, such as an organization's logo, is logged as a warning.

Run the same check, and the check of every published page, from the command line:

```bash
pnpm run seo validate --config   # the start-time check; exits non-zero on errors
pnpm run seo validate --all      # every published page's graph; exits non-zero on errors
```

The same findings reach you elsewhere. `GET /api/seo/findings` reports every published page, and `GET /api/seo/findings/:collection/:slug` one page's. In Studio, the editor's Search and sharing block and Data mode show a document's findings, and the **Publish** question lists the saved version's errors and warnings before it goes live; they inform and never block the publish. **Pulse** and **Structure** show the totals.

## Checked on the deployed site

`seo validate --all` reads the site's database, which a CI job usually cannot reach. A deployed site needs no database to be checked: search engines read each page's JSON-LD from its source, so a post-deploy step can do the same. Fetch the sitemap, request each page, parse every `<script type="application/ld+json">` block and validate it with `validateGraph` and the site's readers. Each block is validated on its own, since a search engine reads each block as its own graph. Fail the step on errors and print warnings, which leave the deploy standing.

```js
import { validateGraph } from '@krantho/seo'

const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
const findings = blocks.flatMap(([, json]) =>
  validateGraph(JSON.parse(json), { profiles: ['google', 'bing'] }),
)
const failed = findings.some((finding) => finding.severity === 'error')
```

krantho.com's production deploy runs this check after warming the page cache: every sitemap page is read from `https://krantho.com`, an error (invalid markup, or a page that does not answer 200) fails the workflow, and a warning, or a page with no structured data, is reported in the log. It needs no credentials. Preview deployments sit behind the host's deployment protection and are not checked.

## Your own types, readers and decorators

`defineSeo` registers a site's own Schema.org type builders, reader profiles and page-structure decorators, the same way krantho registers its built-ins. Call it in a module the server loads before it renders pages.

```ts
import { defineSeo } from '@krantho/seo'

defineSeo({
  types: [
    {
      type: 'Dataset',
      scope: 'document',
      idFragment: 'dataset',
      build: (context) => ({ '@type': context.type, '@id': context.id }),
    },
  ],
})
```

Registration is all or none: a type Schema.org does not have, or a rule without a source, is refused, and nothing is registered.

## Scope hierarchy

SEO configuration cascades through four scopes, from broadest to most specific:

1. **Site**: the organization, WebSite and Person, with the identity from the `site` section of `krantho.config.ts`
2. **Collection**: default types for a content collection
3. **Route**: overrides for the pages whose path matches a URL pattern, stored as `route:<pattern>`
4. **Document**: per-page property overrides

The `seo` section of `krantho.config.ts` seeds these scopes on startup:

```ts title="krantho.config.ts"
import { defineKranthoConfig } from '@krantho/config'

export default defineKranthoConfig({
  site: {
    domain: 'krantho.com',
    name: 'Krantho',
    language: 'en',
    baseUrl: 'https://krantho.com',
    logo: 'https://krantho.com/brand/mark.svg',
    description: 'A CMS library for content sites built in your own codebase.',
  },
  seo: {
    identity: 'Organization',
    collections: { docs: ['Article', 'BreadcrumbList'], features: ['BreadcrumbList'] },
  },
})
```

krantho.com seeds the same scopes from YAML files instead, one per entity, with `seo: { configDir: './krantho.seo' }`.

Seeding keeps rows already in the database unless `seo.seedMode` is `'overwrite'`.

A page composes its JSON-LD from the site scope, its collection, the most specific URL pattern that matches its path, and the document. In a pattern, `*` stands for one path segment and `**` for any rest of the path: `/blog/*` matches `/blog/launch` but not `/blog/2026/launch`, and `/docs/**` matches both `/docs/installation` and `/docs/guides/caching`. When several patterns match, the one with the most literal characters wins. The pages your site renders, the API's SEO preview and Studio's resolved values all compose the same way.

## JsonLd component

For standalone JSON-LD outside the archetype system, use `JsonLd` directly.

```tsx
import { JsonLd } from '@krantho/seo'

<JsonLd data={{
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Example Corp',
}} />
```

## Next steps

- Render SEO meta tags in React: [@krantho/ui-react](/docs/package-ui-react)
- Configure SEO from Studio: [@krantho/studio](/docs/package-studio)
- Seed SEO from the server: [@krantho/server](/docs/package-server#seo-seeding)
