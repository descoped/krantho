---
name: site-design
description: >
  Designs and builds the visual side of a website whose pages are rendered from krantho content,
  with any UI approach (plain CSS, Tailwind, MUI, shadcn, Svelte). Use when asked to design a
  site, a landing page, navigation, a design system or tokens, light and dark themes, a theme
  switch, typography, layout, components, motion, accessibility (WCAG 2.2 AA) or performance
  (Core Web Vitals) for a krantho site — or when a page looks wrong, flashes the wrong theme,
  shifts on load, or fails an accessibility or Lighthouse check.
compatibility: krantho 1.x; Claude Code
metadata:
  krantho-version: 1.1.0
---

# Site design for krantho sites

## Contents

- Principles
- Workflow
- Information architecture
- Rendering content well
- Components that pull their weight
- What not to do
- References

A krantho site is a normal framework app. krantho supplies content — fields and a markdown body
per document — and the site's page templates decide everything visual. This skill is about
making those pages clear, accessible and fast. It carries no brand of its own: take the
brand from the project (existing CSS, a design file, the user's words), and ask when there is
none.

## Principles

1. **Content first.** Every visual decision serves reading and acting. Design from real content
   in the collections, not lorem ipsum; long titles and empty optional fields are part of the
   design.
2. **Copy lives in content, not code.** Headlines, labels, calls to action and footer text are
   fields in krantho documents (often `globals`), so editors change them in `/studio`. Page
   templates hold structure and styling only.
3. **One token system.** Colors, type, space, radius, shadows and motion are CSS custom
   properties defined once for light and once for dark. Components use tokens, never raw
   values.
4. **Shared pages are identical for everyone.** With `cache.pages: 'next-isr'` or `'cdn'`, one
   rendered HTML page is served to every visitor. Nothing per visitor (theme, stack or language
   choice, signed-in state) can be rendered on the server. Apply per-visitor preferences in the
   browser, before first paint.
5. **Accessible by default.** WCAG 2.2 AA in both themes, keyboard use everywhere, one `<h1>` per
   page, semantic HTML before ARIA.
6. **Fast by default.** Server-rendered HTML, little client JavaScript, sized images, few fonts.
   Budgets below.
7. **Motion explains, never decorates.** Short, purposeful, and off under
   `prefers-reduced-motion`.

## Workflow

1. **Survey.** Read the existing styles, layout components and UI package. Read
   `krantho.collections.ts` to see which content each page has. Note what the brand gives you.
2. **Structure.** Decide the page inventory and navigation (below). Map each page to its
   content template and page template — the `content-model` skill designs those together.
3. **Tokens and themes.** Define the token set and the three-state theme (system, light, dark)
   with `${CLAUDE_SKILL_DIR}/references/theming.md`.
4. **Layout and components.** Build the shell (header, main, footer, skip link), then page
   sections from content. Use `${CLAUDE_SKILL_DIR}/references/landing-page.md` for a landing
   or product page.
5. **Check.** Run `${CLAUDE_SKILL_DIR}/references/quality.md`: accessibility, performance and
   motion, in both themes, at phone and desktop widths.

## Information architecture

- **Flat navigation.** Every destination within two steps of the home page. A top navigation of
  a few items, a primary action, and at most one short menu or a sidebar for deep sections such
  as documentation.
- **URLs follow krantho's convention:** `pages` at the root (`/about`), every other collection
  at `/<collection>/<slug>` (`/services/strategy`). krantho's sitemap, editor preview and cache
  refresh assume it.
- **Navigation is content.** Keep the menu in a `globals` document (for example `navigation`
  with a `links` list of `Label|/href` strings, or one field per item) so editors can change it.
  Read globals in a layout below the root layout: the Next.js build prerenders its 404 page
  through the root layout and cannot reach the database.
- **Every list has a detail, every detail links back.** Breadcrumbs on deep pages, "next" and
  "related" links at the end of long pages.
- **Footer** repeats the main destinations, plus legal and contact links.

## Rendering content well

- Markdown body HTML (`html`, or a `##` section from `sections`) goes into a container with
  scoped typographic styles (`.prose` or your own). Style `h2`–`h4`, lists, tables, code,
  blockquotes, images and links there, in both themes.
- Truncate on the page, not in content: `line-clamp` for card descriptions, never slice strings
  in a way that breaks words or markup.
- Empty optional fields hide their element entirely; never render empty headings or buttons.
- Images from the media library are `/api/media/<id>/image?preset=<xs|sm|md|lg|xl|full>`; always
  give `width`, `height` and `alt`. Keep the alt text in a field beside the image field
  (`hero-image-alt` next to `hero-image`, the convention `CMSImageServer` reads), or write `""`
  for a decorative image.
- Code samples are text, not screenshots, with a copy button and a visible language label.
- Mark what an editor can change. Every element that renders a field or a `##` section carries
  its Live marks (`kranthoField`, `kranthoSection`, `markBodySections` from
  `@krantho/core/marks`, with the document it belongs to), so Studio's Live mode can edit
  the page in place. They exist only in an editor's preview and never change what visitors get.
  A whole body's sections are wrapped in `display: contents` elements in a preview, so style
  body content with descendant selectors (`.prose p`), not `>` or `:first-child`. Allow the
  site's own origin to frame its pages: a CSP `frame-ancestors` includes `'self'`. The
  `content-model` skill's `references/page-templates.md` has the details.

## Components that pull their weight

Header with skip link, primary action button, cards (title, one line, link on the whole card
with one real `<a>`), callouts (note, tip, caution), tabs for alternatives (keyboard: arrow keys,
`role="tablist"`), disclosure with `<details>`, breadcrumbs, pagination or "load more" for long
lists, a theme switch. Prefer native elements (`<details>`, `<dialog>`, `<button>`) over custom
widgets.

## What not to do

- Render theme, language or any per-visitor state on the server of a cached page.
- Hard-code copy in components, or put layout decisions into content fields.
- Hide focus outlines, rely on color alone, or put text over images without a contrast guarantee.
- Load a font family or a JavaScript library for one flourish.
- Animate layout properties (`width`, `top`) or run motion that ignores reduced-motion.
- Add a carousel for primary content: most visitors see only the first slide.

## References

- `${CLAUDE_SKILL_DIR}/references/theming.md` — tokens, system/light/dark themes without a flash,
  the theme switch.
- `${CLAUDE_SKILL_DIR}/references/landing-page.md` — landing and product page structure.
- `${CLAUDE_SKILL_DIR}/references/quality.md` — accessibility, performance budgets, motion, and a
  pre-release checklist.
