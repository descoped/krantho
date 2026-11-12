# Content Strategy

How to organize and write user-facing documentation using the Diátaxis framework.

## Information architecture

Four content types, each serving a different user need:

| Type | Purpose | User state | Location |
|------|---------|-----------|----------|
| **Tutorials** | Learning by doing | "I'm new, show me" | `getting-started/` |
| **How-to guides** | Accomplish a specific goal | "I need to do X" | `guides/` |
| **Reference** | Precise technical facts | "What's the API for Y?" | `packages/`, `reference/` |
| **Explanation** | Understanding concepts | "Why does Z work this way?" | Inline in guides or dedicated pages |

## Site map

```
Getting Started (tutorial sequence — do these in order)
├── Installation
├── Your First Page
└── Add SEO

Guides (task-oriented — pick what you need)
├── Content Authoring
├── SEO Pipeline
├── Persistence & Storage
├── Rendering Modes (SSG/SSR/ISR)
├── Styling with Tailwind
├── Styling with MUI
└── Using with SvelteKit

Packages (API reference — one per package)
├── @krantho/core
├── @krantho/ui-react
├── @krantho/seo
├── @krantho/persistence
├── @krantho/persistence-fs
├── @krantho/schema
├── @krantho/ui-mui
├── @krantho/ui-tailwind
├── @krantho/ui-svelte
└── @krantho/tools

Reference (lookup tables)
├── Frontmatter Keys
├── Semantic Styles
└── Site Configuration
```

## Adapting developer docs to user docs

Developer docs (`docs/`) are internal — written for people building krantho. User docs (`krantho-site/content/docs/`, served at `krantho.com/docs`) are external — written for people using krantho.

| Developer doc says | User doc says |
|-------------------|---------------|
| "ContentEngineFactory.create(loader, config)" | "Configure your content loader" + code example |
| "IPersistenceAdapter extends IContentLoader" | "krantho reads content through adapters" |
| Architecture internals | "How it works" (simplified) |
| Full type definitions | Most-used types only, with examples |

Rules:
- Lead with what the user wants to do, not what the API is
- Show the import + usage together (not just the type signature)
- Hide internal complexity — expose only what consumers touch
- Link to GitHub source for the curious, don't dump it in docs

## Page structure

Every page follows this pattern:

```markdown
---
title: Page Title
description: One sentence for SEO, search results and the page summary
area: guides
order: 10
---

Opening paragraph: what this page helps you do.

## Prerequisites (if any)

What you need before starting.

## The main content

Step by step, or concept by concept.

## Next steps

Where to go from here (link to related guides/reference).
```

## Landing page

The index page should communicate in 10 seconds:
1. What krantho is (one sentence)
2. Who it's for (one sentence)
3. What to do next (install button + "Get Started" link)
