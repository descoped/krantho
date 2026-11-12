---
name: website-design
description: >
  Holds krantho.com's brand, design system and page-template rules — tokens, the system/light/dark
  theme, typography, the content-graph visual motif, components, layout, motion, accessibility and
  performance budgets, and the map from content templates (collections) to page templates (routes).
  Use when building or changing anything visual on krantho.com (krantho-site/): pages, components,
  CSS, SVG brand assets, icons, illustrations, Open Graph images; when adding a content template;
  or when asked about the site's design, brand, theme or layout.
---

# Website design — krantho.com

## Contents

- Character
- Files
- Tokens — always use them
- Theme — system, light, dark
- Layout
- The content-graph motif
- Components and patterns
- Content templates → page templates
- Accessibility and performance budgets

krantho.com is one site with two faces — the product site and the Krantho Developer
Documentation (`/docs`) — sharing one shell, one design system, search, theme and stack
preference. It runs on krantho exactly as a customer's site would, so every page is a **page
template** (a component on a route) rendering **content templates** (collections edited in
`/studio`).

## Character

Nordic, calm, technical, crafted. Snow and birch surfaces by day, fjord night in the dark; aurora
teal as the accent with violet as its companion in gradients; topographic contour lines as a quiet
texture. Striking through restraint and precision — generous space, strong type, real code — never
through noise. Copy follows the `copywriting` skill.

## Files

| What | Where |
|---|---|
| Tokens (both themes) | `krantho-site/app/styles/tokens.css` |
| Base, prose, code, stack tabs, callouts | `krantho-site/app/styles/base.css` |
| Shell (header, palette, footer) | `krantho-site/app/styles/shell.css` |
| Page-template styles | `krantho-site/app/styles/<template>.css`, imported by that template |
| Brand mark and wordmark | `krantho-site/app/components/brand.tsx`, SVG files in `public/brand/` |
| Icons | `krantho-site/app/components/icons.tsx` |
| Markdown pipeline | `krantho-site/lib/markdown.ts` (+ `lib/highlight.ts`) |
| Content reads | `krantho-site/lib/content.ts`; routes in `lib/routes.ts` |
| Content templates | `krantho-site/krantho.collections.ts` |

## Tokens — always use them

Colors: `--color-bg`, `--color-bg-subtle`, `--color-surface`, `--color-surface-raised`,
`--color-border(-strong)`, `--color-text(-muted|-subtle)`, `--color-accent(-strong|-soft|-contrast)`,
`--color-violet(-soft)`, `--color-amber(-soft)`, `--color-rose(-soft)`, `--color-code-bg`,
`--aurora-1..3`, `--contour`. Type: `--font-display` (Bricolage Grotesque), `--font-text` (the system UI face — no download),
`--font-mono` (JetBrains Mono); sizes `--text-xs..4xl`. Space `--space-1..10` (4px grid). Radius
`--radius-sm..xl|full`. Motion `--ease-out`, `--duration-fast|base|slow` (zero under reduced
motion). Never hard-code a color: a hard-coded color breaks one of the themes.

## Theme — system, light, dark

- `data-theme` on `<html>` is `light`, `dark`, or absent (follow the OS). It is set before first
  paint by the inline script in `app/layout.tsx`; the choice lives in `localStorage`
  (`krantho-theme`). Pages are ISR-cached and shared, so the server never renders a per-visitor
  theme.
- The same holds for the stack preference: `data-stack` = `next` | `sveltekit` | `express`
  (`krantho-stack`). Code groups render every variant; CSS shows the visitor's.
- Controls are server-rendered and styled from the `<html>` attribute; `<Interactions/>`
  (`app/components/interactions.tsx`) handles clicks by delegation (`data-copy`,
  `data-stack-tab`, `data-theme-choice`, `data-track`).
- Every visual has both themes: SVGs use `currentColor` and token variables, not fixed colors.

## Layout

- `.container` (72rem) for product pages, `.container--wide` (88rem) for docs and the header;
  `--gutter` for side padding; `.section` for vertical rhythm; `.section--subtle` for alternating
  bands.
- Flat navigation: every destination within two steps — header links, the ⌘K palette, the docs
  sidebar, and in-page tables of contents.
- Mobile first: every page works at 360px with no horizontal scroll (tables and code scroll inside
  their own box).

## The content-graph motif

A document (fields: title, description, status) with edges to what it becomes: the rendered page,
its JSON-LD graph, its place in search and `llms.txt`. Drawn as nodes and edges in SVG, animated
calmly with CSS (stroke-dash drawing, soft pulses), and still under `prefers-reduced-motion`. It
appears in the hero, on feature pages, and in "How this page is made".

## Components and patterns

- Buttons: `.button--primary` (one per view), `.button--secondary`, `.button--ghost`;
  `.link-arrow` for inline next steps. Cards: `.card` (link cards lift on hover). Badges:
  `.badge`, `.badge--accent`. Eyebrow: `.eyebrow`. Section heads: `.section-head`.
- Code: `lib/markdown.ts` renders fences (`title="file.ts"`, `stack="next"`), sample embeds
  (`{{sample:name}}`) and callouts (`> [!NOTE]`, `[!TIP]`, `[!CAUTION]`, `[!SINCE] 0.2.0`). In
  React, render samples with `sampleHtml(name)` / `codeBlockHtml(variants)` and `<Html>`.
- "How this page is made": `<HowMade template="app/(site)/…/page.tsx" sources={[…]} />` at the end
  of every page.

## Content templates → page templates

| Collection | Route (page template) | Notes |
|---|---|---|
| `globals` (`navigation`, `announcement`, `footer`) | shell (`app/(site)/layout.tsx`) | links are `Label|/href`; footer `# Group` starts a column |
| `landing` (`home`) | `/` | sections: Problem, How it works, Fit |
| `features` | `/features`, `/features/[slug]` | sections: Problem, Approach, Proof, Limits |
| `stacks` | `/stacks`, `/stacks/[slug]` | sections: Install, Wire, Render, Deploy |
| `hosts` | `/deploy`, `/deploy/[slug]` | sections: Set up, Configure, Cache, Verify |
| `docs` | `/docs`, `/docs/[slug]` | area, order, prerequisites/next/related are docs slugs |
| `snippets` | embedded | `sample` groups variants; `stack` picks the tab |
| `faq` | FAQ blocks | body is the answer |
| `glossary` | `/docs/glossary` | |
| `releases` | `/changelog`, `/changelog/[slug]` | sections: Added, Changed, Fixed |
| `pages` | `/[slug]` (about, agent-skills, …) | |

Section contracts: a page template gives each named `##` section its designed treatment, renders
unknown sections as prose, and leaves missing ones out. All routes are dynamic segments whose
`generateStaticParams` returns `[]` with `revalidate = false`: the build never reads the database,
and each page stays cached until a change in `/studio` invalidates it. A document with no published
version answers 404 (`page()` in `lib/content.ts`).

## Accessibility and performance budgets

- WCAG 2.2 AA in both themes; visible focus (`:focus-visible` ring); keyboard use for navigation,
  palette, tabs and theme switch; `aria-label`s on icon-only controls; one `<h1>` per page.
- Core Web Vitals (mobile, lab): LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms. Lighthouse ≥ 95 in all four
  categories on the landing page, a feature page and a docs page.
- Minimal client JavaScript on product pages: interactivity by delegation, `<details>` over
  custom disclosure components, CSS animation over JS animation, libraries loaded on first use
  (the search palette imports MiniSearch when it opens). Two web fonts only — the display face
  (preloaded) and the monospace (not preloaded); body text uses the system UI face. No images
  without dimensions; decorative textures are static files drawn through CSS masks, never inline
  SVG in the HTML (inline markup is sent twice: in the HTML and in the page's React payload).
- Code samples: `lib/highlight.ts` compacts Shiki's per-token inline colors into classes, and
  replaces theme colors that fall below 4.5:1 on the code background.
