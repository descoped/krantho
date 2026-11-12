# Content Authoring Guide

This guide is for people who write and edit content in the krantho framework. No coding knowledge required.

## File Format

Every content file is a plain text file with the `.md` extension. It has two parts:

1. **Frontmatter** -- structured fields between `---` markers at the top
2. **Markdown body** -- free-form content below the frontmatter

Here is a complete annotated example:

```markdown
---
title: 'About Acme Consulting'
description: 'Founded in 2010, Acme Consulting was built on the belief that great strategy is nothing without great execution.'
meta-description: 'Meet the team behind Acme Consulting. 15+ years of experience in strategy and advisory.'
---

# About Us

We are a team of strategists, technologists, and operators who thrive on solving hard problems.

## our-team

Our team includes former executives, product leaders, and engineers from global consultancies, technology companies and fast-growing startups.

### Leadership

**Managing Partner** -- 20 years in management consulting.

## our-approach

We believe in three principles:

1. **Start with the problem, not the solution.**
2. **Work alongside, not above.**
3. **Measure what matters.**
```

The frontmatter (between `---`) defines fields that the framework uses to populate specific parts of the page -- titles, navigation labels, meta tags, and so on. The markdown body below is the main page content.

## Frontmatter Keys

Frontmatter keys follow a naming convention with prefixes. Each prefix controls a specific part of the page or site. Keys use kebab-case (lowercase words separated by hyphens).

### Page-level keys

These appear on the page itself:

| Key | Purpose |
|-----|---------|
| `title` | The main page title (required on every page) |
| `description` | Page description for display; the SEO fallback when `meta-description` is empty |
| `meta-description` | SEO description shown in search results (120-155 characters) |
| `status` | `draft` or `published` -- see Status Workflow below |

### Navigation keys (`nav-`)

Define labels for the navigation menu. Used in the `globals` collection (see Content Organization below), e.g. `content/globals/navigation.md`.

| Key | Purpose |
|-----|---------|
| `nav-home` | Label for the Home link |
| `nav-about` | Label for the About link |
| `nav-services` | Label for the Services link |
| `nav-fees` | Label for the Fees link |
| `nav-contact` | Label for the Contact link |

### Footer keys (`footer-`)

Control the site footer content. Used in `content/globals/footer.md`.

| Key | Purpose |
|-----|---------|
| `footer-title` | Business name in the footer |
| `footer-description` | Short tagline in the footer |
| `footer-copyright-text` | Copyright notice |
| `footer-privacy-link-text` | Label for the privacy policy link |

### Logo keys (`logo-`)

Define the site logo text. Used in `content/globals/navigation.md`.

| Key | Purpose |
|-----|---------|
| `logo-name` | Primary logo text |
| `logo-subtitle` | Tagline below the logo |

### Contact keys

Several prefixes handle contact information. Used in `content/globals/contact-info.md`:

| Prefix | Keys | Purpose |
|--------|------|---------|
| `phone-` | `phone-title`, `phone-number`, `phone-subtitle` | Phone display |
| `email-` | `email-title`, `email-address`, `email-subtitle` | Email display |
| `location-` | `location-title`, `location-address`, `location-subtitle` | Physical address |
| `hours-` | `hours-title`, `hours-line1`, `hours-line2` | Business hours |
| `booking-` | `booking-url`, `booking-button-text` | Online booking link |

### Service keys (`service-N-`)

For pages that list services with pricing (like a fees page), use numbered service keys. The `@krantho/tools` SEO pipeline reads them from `fees.md` to price the Schema.org offer catalog:

| Key pattern | Purpose |
|-------------|---------|
| `service-1-title` | Name of the first service |
| `service-1-price-1` | First price tier for service 1 |
| `service-1-duration-1` | Duration for the first price tier |

The number after `service-` groups related fields together. You can have `service-1-`, `service-2-`, and so on.

### Service documents

Each service is its own file in the `services` collection (`content/services/strategy.md`), with these fields:

| Key | Purpose |
|-----|---------|
| `title` | Display name of the service |
| `description` | Service description |
| `ingress` | Short lead-in for service cards and list views |
| `order` | Sort position in listings; lower comes first |

### Other prefixes

| Prefix | Purpose |
|--------|---------|
| `cert-` | Certifications and credentials |
| `form-` | Form labels and placeholders |
| `table-header-` | Table column headers |
| `featured-image-` | Hero or feature images |
| `published-` | Publication date for blog posts |
| `updated-` | Last-updated date for blog posts |
| `series-` | Blog post series metadata |

### Site identity

The site's name, domain, language and base URL are not frontmatter. They live in the `site` section of `krantho.config.ts` (see [configuration](../configuration.md)).

## Sections

Markdown `##` headings create named sections within a page. These sections are addressable by the framework -- components can render a specific section by name.

### Naming convention

A section is named by its heading text as written (trailing `#`s and surrounding spaces removed), so `## How it works` is the section `How it works`. A lookup by name (`findSection`) ignores case. Where a frontmatter key refers to a section, as `meta-description-{section}` does, the heading must be usable in a key: these pages use **kebab-case** headings:

```markdown
## our-approach
## our-team
## track-record
```

### How sections work

When you write:

```markdown
## strategy

### What We Do

Our strategy practice helps leadership teams make high-stakes decisions.

### Typical Engagements

- Market entry and expansion strategy
- Competitive analysis and positioning

## digital-transformation

### What We Do

We help organizations modernize their technology stack.
```

Each `##` heading creates a separate section. The framework can render the `strategy` section independently from the `digital-transformation` section. Sub-headings (`###`) and all content below belong to the section above them. The markdown before the first `##` heading is the lead. A `##` line inside a fenced code block is text, not a heading. Two sections with the same heading stay separate; the first is the one the heading names.

One section model serves the server, the UI packages, Studio and page templates: `splitSections()` in `@krantho/core` (also `@krantho/core/sections`, safe for a browser bundle), see [core.md](../core.md#sections).

### Designed sections

A collection can declare the `##` sections its page template designs, in order, with the `sections` option of `defineCollection()` (see [schema.md](../schema.md)). The template gives each designed section its own treatment, renders other sections as prose and leaves missing ones out; Studio shows editors which designed sections a document has. `GET /api/collections` returns each collection's `sections`.

### Section-specific SEO

Each section can have its own meta description in the frontmatter using the `meta-description-` prefix:

```yaml
meta-description-strategy: 'Strategic consulting: market analysis and growth roadmaps.'
meta-description-digital-transformation: 'Digital transformation: platform modernization and data strategy.'
```

The section slug in the frontmatter key must match the `##` heading name exactly.

## SEO Fields

### What you write manually

- **`meta-description`** on each page file -- a 120-155 character summary for search engine results. Write this as a natural sentence describing what the user will find on the page.
- **`meta-description-{section}`** for service sub-pages or sections that have their own URL.

### What the enrichment tools generate

The project includes AI-powered tools that can generate or validate SEO content. These run as separate commands (not automatically):

| Tool | What it does |
|------|--------------|
| `seo:enrich:meta` | Generates `meta-description` fields from page content |
| `seo:enrich:faq` | Generates FAQ question-answer pairs for each page |
| `seo:enrich:services` | Generates service descriptions for Schema.org structured data |
| `seo:enrich:llms` | Generates link descriptions for the llms.txt file |

All enrichment tools run in **dry-run mode by default** (preview only). A developer must explicitly apply changes.

### business.yaml

The file `content/seo/business.yaml` contains non-CMS business metadata used for Schema.org structured data. This includes:

- Geographic coordinates
- Legal entity name
- Credentials and certifications
- Areas of expertise (`knows-about`)
- Prose summary for AI assistants

This file is typically edited by the content author in collaboration with a developer. Changes here feed into the generated `structured-data.json` after running the SEO pipeline.

## Status Workflow

Content items can have a `status` field in frontmatter that controls visibility:

```yaml
---
title: 'Draft Article'
status: draft
---
```

| Status | Meaning |
|--------|---------|
| `published` | Visible on the site (default for a file that omits it -- `content.defaultStatus.filesystem`) |
| `draft` | Hidden from public-facing pages, visible in Studio (a document created through the API or Studio starts as a draft) |
| `archived` | Hidden from public-facing pages, kept in Studio |

The frontmatter status says whether a file is live: a file imported from disk goes live when its status is `published` and is taken offline otherwise. Inside the CMS, the status is the document's publication state, derived from its live version.

Pages show only the live (published) version of a document. Saving never changes what visitors see: a save over a published page appends a new version ahead of the live one (Studio shows "Unpublished changes"), and Publish makes the current version live. Unpublishing (back to draft), archiving or deleting takes the page offline, and it answers 404. The sitemap follows the same rule. On the filesystem adapter, which keeps no history, a save to a published file is live at once.

When a collection's schema declares a `status` field, the CMS keeps it equal to the document's publication state (an archived document's field says `archived` only when the schema accepts that value, otherwise `draft`). `GET /api/content/:collection` accepts a `status` filter (`draft`, `published` or `archived`, by publication state) for Studio and API clients, passed to the adapter's `query`. Server-rendered pages read published content only.

## Locale

Content items can specify a `locale` field in frontmatter:

```yaml
---
title: 'Om oss'
locale: nb
---
```

When using database-backed persistence, the locale is stored alongside the content and can be used to filter with `ContentQuery.locale`. A file that declares no `locale` is in the site's default locale (`site.defaultLocale` in the configuration), and so is every database read or write that names none.

## Content Organization

### One file per page

Each page on the site has one markdown file in `content/pages/`. The filename (without `.md`) becomes the URL slug:

| File | URL |
|------|-----|
| `home.md` | `/` (homepage) |
| `about.md` | `/about` |
| `services.md` | `/services` |
| `contact.md` | `/contact` |
| `fees.md` | `/fees` |

### Globals collection

The `globals` collection holds content shared across all pages, one frontmatter-only file per concern in `content/globals/`:

- `navigation.md` -- logo text and navigation labels
- `footer.md` -- footer content
- `contact-info.md` -- phone, email, address, hours, booking link

Every field is available to the layout on every page. In schema terms, `globals` is a collection with `source: 'filesystem'`.

### Services collection

Each service is a separate file in `content/services/`. The collection is typically filesystem-mastered, and the file slugs match the `serviceIds` in `site-config.json` so the SEO pipeline can find them.

### Adding a new page

To add a new page:

1. Create a new `.md` file in `content/pages/` (e.g., `careers.md`)
2. Add `title` in the frontmatter (this is the only required field)
3. Add a `meta-description` for SEO
4. Write your content in the markdown body
5. Use `##` sections with kebab-case names if you need addressable sections

### File structure overview

```
content/
  globals/
    navigation.md      -- logo text and nav labels
    footer.md          -- footer content
    contact-info.md    -- phone, email, address, hours
  pages/
    home.md            -- homepage content
    about.md           -- about page
    services.md        -- services listing page
    contact.md         -- contact page
    fees.md            -- pricing information
  services/
    strategy.md        -- one file per service
  seo/
    site-config.json   -- input for the @krantho/tools pipeline
    business.yaml      -- Schema.org metadata (coordinates, credentials, etc.)
    guardrails.yaml    -- FAQ Q&A pairs per route (generated/validated by tools)
    generated/         -- auto-generated files (never edit by hand)
```
