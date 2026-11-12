---
title: Content authoring
description: Write and organize the markdown files of a krantho site — the file format, frontmatter keys, sections, drafts and SEO fields.
area: guides
order: 10
level: beginner
stacks: [next, sveltekit, express]
prerequisites: [first-page]
next: [media, seo-pipeline]
related: [content-model, content-fields, studio, configuration]
status: published
---

You manage site content through plain text files. Each page is a single `.md` file with two parts: **frontmatter** at the top and a **markdown body** below. Inside the CMS — the API, Studio and the database — the same frontmatter is called **fields**.

## File format

Every content file follows this structure:

```markdown title="content/pages/about.md"
---
title: 'About krantho'
description: 'Krantho is a CMS library built by Descoped AS for developers who build content sites in their own codebase. Why it exists and where it stands.'
eyebrow: 'About'
status: published
---

Krantho is built by Descoped AS. It is a CMS library: it adds content management, an admin and structured SEO to a site you build yourself.

## Why it exists

Most content sites are built by developers and written by other people.

## Where it stands

Krantho 1.0 is released.
```

The frontmatter sits between `---` markers. It defines the structured fields the site uses for titles, navigation, meta tags and more. The markdown body below it is the page's main content. The first paragraph before any heading serves as the lead, or intro, text.

## Frontmatter keys

Keys use kebab-case: lowercase words joined by hyphens. The keys a document accepts are the fields its collection's schema defines (see [Content model](/docs/content-model)); krantho reads a few of them by name.

### Page keys

| Key | Purpose |
|-----|---------|
| `title` | Main page title. Required on every page. |
| `description` | Page description for SEO and display. Aim for 120–155 characters. |
| `status` | `published`, `draft` or `archived`. A file without one counts as `published`. |

### Keys of your own

Every other key is yours to name for what it means to an editor. krantho.com's feature pages, in `content/features/`, use these:

| Key | Purpose |
|-----|---------|
| `benefit` | The one-line promise under the title, also shown on the feature's card |
| `order` | Position in the feature list; lower comes first |
| `icon` | One of the site's icons, chosen from a fixed list |
| `proof-sample` | The code sample the page's Proof section shows |
| `docs-page` | The docs page the feature links to, picked from the `docs` collection |

### Globals

Site-wide content lives in documents of the `globals` collection, one per concern. krantho.com keeps its header navigation as a list of `Label|/href` entries:

```yaml title="content/globals/navigation.md"
title: Navigation
links:
  - 'Features|/features'
  - 'Stacks|/stacks'
  - 'Deploy|/deploy'
  - 'Docs|/docs'
  - 'Changelog|/changelog'
cta-label: Get started
cta-href: /docs/introduction
```

A project made with `create-krantho` starts with `nav-` and `footer-` keys in its `navigation` and `footer` globals instead. Either shape is a convention your layout reads; the CMS does not interpret these keys.

### Site identity

The site's name, domain, language and base URL are not frontmatter. They live in the `site` section of `krantho.config.ts` — see [Configuration](/docs/configuration).

## Draft and published

Your site renders only the **live** version of a document, the one last published. The `status` key decides what a markdown file imports as, because the file is the source of that document:

| Status | On the site |
|--------|-------------|
| `published` | Live. A file without a `status` gets `content.defaultStatus.filesystem`, which is `published` by default. |
| `draft` | Imported, but not shown until the document is published. |
| `archived` | Offline. |

In the database, saving and publishing are separate. A document created in Studio or through the API is not live until it is published. Saving a document, whoever saves it, appends a new version and leaves the live page as it is. Publishing makes the current version live; unpublishing, archiving or deleting takes the page offline. While the live version is older than the current one, the document has unpublished changes. Its `status` stays `published` as long as a version is live. Editors can open their unpublished changes on the page itself, in Live mode or with **Open on site** — see [Studio](/docs/studio#preview-drafts-on-the-site).

The filesystem adapter keeps no history: a save to a published file is live at once.

## Sections

Use `##` headings in the markdown body to create named sections. A page can render each section on its own.

### Naming rules

A section's name is its heading text, exactly as written. Use kebab-case, so the same name also works inside a frontmatter key such as `meta-description-<section>` (below):

```markdown
## how-it-works       ← section "how-it-works"
## limits             ← section "limits"
## How it works       ← section "How it works": works, but breaks the kebab-case key convention
```

### How sections work

```markdown
## how-it-works

### One tag per read

Every read a page makes records a cache tag.

## limits

### Purges

A purge that fails is logged and never fails the write.
```

Each `##` heading starts a new section. Everything below it, including `###` subheadings, belongs to that section, up to the next `##`. A `##` line inside a fenced code block is code, not a heading. The text before the first `##` is the lead. A page can render `how-it-works` separately from `limits` — krantho.com's feature pages give each of their sections its own layout.

### Designed sections

A collection can declare the sections its page template designs, in order. On krantho.com a feature page designs Problem, Approach, Proof and Limits: write those `##` headings and each gets its own treatment, while any other section renders as prose, in the order you wrote it. A designed section you leave out is left out of the page. Headings match a designed section without regard to case. [Templates](/docs/templates#designed-sections) shows how a collection declares them.

### Section-specific SEO

Give each section its own meta description with the `meta-description-` prefix:

```yaml
meta-description-how-it-works: 'How krantho keeps each page cached until its content changes.'
meta-description-limits: 'What the page cache does not do yet.'
```

The name in the key must match the `##` heading exactly.

## SEO fields

### What you write

Add these to each content file yourself:

- **`meta-description`** — a 120–155 character summary for search results. Write a natural sentence describing what the reader finds on the page. It is separate from `description`, which it falls back to when empty.
- **`meta-description-{section}`** — for sections that have their own URL.

### What the tools generate

The SEO pipeline includes AI tools that generate or validate SEO content. They run as separate commands, never automatically.

| Command | What it does |
|---------|-------------|
| `pnpm run seo:enrich:meta` | Generates `meta-description` fields from page content |
| `pnpm run seo:enrich:faq` | Generates FAQ question-answer pairs per page |
| `pnpm run seo:enrich:services` | Generates service descriptions for Schema.org data |
| `pnpm run seo:enrich:llms` | Generates link descriptions for the `llms.txt` file |

All tools run in **dry-run mode by default**, so you preview changes before applying them.

> [!NOTE]
> These scripts belong to `@krantho/tools`, a private package: run them from a checkout of the krantho repository, pointed at your project with `--root <dir>` (see [@krantho/tools](/docs/package-tools)). The repository is private while krantho is in development — [Project status](/docs/project-status) explains how to work from source today. Studio enriches documents at runtime instead — see [Studio](/docs/studio#structure).

## Content organization

### One file per document

Each document is one markdown file in its collection's directory. The file name is the slug, and the collection's `path` turns it into a URL. On krantho.com:

| File | URL |
|------|-----|
| `content/landing/home.md` | `/` |
| `content/pages/about.md` | `/about` |
| `content/features/seo.md` | `/features/seo` |
| `content/docs/installation.md` | `/docs/installation` |

Your routes decide the URLs, and a collection's `path` in `defineCollection()` tells krantho where they are wherever it needs a document's page — the sitemap, the draft preview, the Next.js re-render right after a publish and the page's JSON-LD. Without a `path`, krantho assumes this layout: `pages` documents at the site root (`home` at `/`), every other collection at `/<collection>/<slug>`. Globals have no page of their own. Route your pages to match — see [Content model](/docs/content-model#edit-details-alongside-the-page).

### Globals for shared content

Content shared across all pages — on krantho.com the navigation, the footer and the announcement line above the header — lives in the `globals` collection, one frontmatter-only file per concern in `content/globals/`.

### Add a new page

1. Create a `.md` file in `content/pages/`, such as `privacy.md`.
2. Add `title` in the frontmatter. It is the only required field.
3. Add a `description` for SEO.
4. Write your content in the markdown body.
5. Use `##` sections with kebab-case names if you need addressable sections.

### File structure

krantho.com's content directory, one directory per collection:

```text
content/
  globals/
    navigation.md     -- header links and the call to action
    footer.md         -- footer columns and tagline
    announcement.md   -- the line above the header
  landing/
    home.md           -- the landing page at /
  features/           -- a page each at /features/<slug>
  stacks/             -- a page each at /stacks/<slug>
  hosts/              -- a page each at /deploy/<slug>
  docs/               -- this documentation at /docs/<slug>
  releases/           -- the changelog at /changelog/<slug>
  pages/
    about.md          -- /about
    agent-skills.md   -- /agent-skills
  snippets/           -- code samples, no page of their own
  faq/                -- questions shown on product and docs pages
  glossary/           -- terms shown on /docs/glossary
  seo/
    site-config.json  -- input for the @krantho/tools pipeline
```

## Next steps

- [Media](/docs/media) — upload images and bind them to fields.
- [SEO pipeline](/docs/seo-pipeline) — structured data, FAQ markup and `llms.txt` from YAML sources.
- [Content fields](/docs/content-fields) — the field reference.
