---
name: docs
description: >
  Writes, migrates and verifies the Krantho Developer Documentation at krantho.com/docs — docs pages
  are documents in the `docs` collection of krantho-site, edited as markdown files in
  krantho-site/content/docs/ or in /studio. Use when adding or changing a docs page, reorganizing
  the docs, writing code samples (snippets), FAQ or glossary entries, or when asked about "docs",
  "documentation", "user docs", "krantho.com/docs". Developer docs for people building krantho
  itself live in docs/ (the dev-docs skill), not here.
---

# Krantho Developer Documentation

## Contents

- A docs page
- Information architecture
- Honesty rules
- Sources of truth
- Renaming or removing a page
- How a page reaches krantho.com
- Gate
- Verification (every new or migrated page)

The docs are content in krantho — the `docs` content template of `krantho-site` — rendered by the
page template `krantho-site/app/(site)/docs/[[...slug]]/page.tsx` at `krantho.com/docs/<slug>`.
They are written for developers who **use** krantho. Style: technical, exact, task-first,
runnable, stack-aware. Section introductions follow the `copywriting` voice (calm, modest).

## A docs page

`krantho-site/content/docs/<slug>.md` — the file name is the slug and the URL (`/docs/<slug>`);
docs URLs are flat, the sidebar groups them by `area`.

```markdown
---
title: Installation
description: One sentence — shown under the title, in search results and as the meta description.
area: get-started          # get-started | concepts | guides | deploy | reference | skills
order: 20                  # position within the area
level: beginner            # beginner | intermediate | advanced (optional)
stacks: [next, sveltekit, express]   # which stacks the page applies to (optional)
since: 0.1.0               # optional
prerequisites: [introduction]        # docs slugs (optional)
next: [first-page]                   # docs slugs (optional)
related: [configuration]             # docs slugs (optional)
status: published
---

Opening paragraph: what this page helps you do.

## A section

…
```

- `##` headings form the on-page table of contents; `###` nest under them. One `#` never appears
  in the body — the title is the `<h1>`.
- Code fences take a title and a stack: ```` ```ts title="krantho.config.ts" ````; adjacent
  fences with `stack="next"`, `stack="sveltekit"`, `stack="express"` become one tabbed block that
  follows the reader's chosen stack.
- Reusable samples live in the `snippets` collection (`krantho-site/content/snippets/`); embed
  them with a paragraph `{{sample:<name>}}`. Use a snippet when the same code appears on more than
  one page (landing, stack page, docs).
- Callouts: `> [!NOTE]`, `> [!TIP]`, `> [!CAUTION]`, `> [!SINCE] 0.2.0`.
- Links to other pages: `/docs/<slug>`; to product pages: `/features/<slug>`, `/stacks/<slug>`,
  `/deploy/<slug>`.

## Information architecture

| Area | Holds |
|---|---|
| `get-started` | introduction, project status, installation, first page, add SEO |
| `concepts` | content model, content and page templates, configuration, rendering and caching, SEO archetypes, persistence, media, Studio |
| `guides` | task-oriented how-tos |
| `deploy` | per host and CDN |
| `reference` | configuration, content fields, semantic styles, packages, API, CLI, glossary |
| `skills` | the public krantho plugin and its skills |

## Honesty rules

- krantho is in active development and **not published to npm**; the repository is private.
  Install commands describe the published packages the first release will use — the
  `project-status` page says so, and `installation` links to it. Never imply a command works today
  when it does not.
- No pricing and no licence statements.

## Sources of truth

| Source | Used for |
|---|---|
| `packages/*/src/` | signatures, defaults, behavior — the final word |
| `docs/*.md` | developer docs to adapt for users |
| `examples/` (`nextjs-shadcn` is the reference) | how a real site is wired |
| `krantho-site/` | a second real site, including content and page templates |

See `references/content-strategy.md` for adapting developer docs and `references/writing-style.md`
for voice, code-example and page-length rules.

## Renaming or removing a page

Docs URLs are permanent. When a slug changes or a page goes away, add a permanent redirect from the
old path in `redirects()` in `krantho-site/next.config.ts`, and update every `prerequisites`,
`next` and `related` list and every `/docs/<slug>` link that named it.

## How a page reaches krantho.com

The markdown files are imported into the site's database only when the database is empty
(`autoImport`); after that the database is the source, and editors change pages in `/studio`.

- **Locally:** remove the local SQLite database (`persistence.sqlite.path`, by default
  `.krantho/content.db`, under `paths.dataDir`) so the next start imports the files again, or make the same edit
  in `/studio`.
- **Production:** a release that changes `krantho-site/content/` is published with a database
  reset — the operator's deployment runbook — until #290/#298 import changed files on
  deploy. Edits made in `/studio` since the last import are lost in a reset, so make urgent fixes in
  `/studio` as well as in the file.

## Gate

`pnpm --filter krantho-site run build` passes (the TS gate in `.claude/rules/way-of-work.md`
covers `krantho-site/`), and the page renders at `/docs/<slug>` in the local site with its code
tabs, callouts, snippets and links working.

## Verification (every new or migrated page)

Use the #299 pattern for anything wider than one page: writers → independent accuracy verifiers
(each claim, signature, default, command and path checked against the code on master) →
a completeness critic. A single page gets at least one independent verification pass. A page is
not done while any claim is unverified.
