# Quality: accessibility, performance, motion

## Accessibility — WCAG 2.2 AA

Structure
- One `<h1>` per page; headings in order without skipped levels. The markdown body starts at
  `##`, so a page template renders the title as the `<h1>`.
- Landmarks: `<header>`, `<nav aria-label>`, `<main id="main">`, `<footer>`. A "Skip to content"
  link is the first focusable element.
- `<html lang>` from the site language (`site.language`); `lang` on passages in another language.
- Lists are lists, tables have `<th scope>`, forms have `<label>`s.

Keyboard and focus
- Everything works with a keyboard alone: navigation, menus, tabs, dialogs, the theme switch.
- A visible focus indicator on every focusable element (`:focus-visible`, at least 2px, 3:1
  against its surroundings). Never `outline: none` without a replacement.
- Focus is not hidden behind sticky headers (`scroll-padding-top` equal to the header height).
- Dialogs trap focus and return it on close; `Escape` closes.
- Targets are at least 24×24 CSS pixels.

Color and content
- Text contrast 4.5:1, large text and UI boundaries 3:1 — in light **and** dark.
- Never color alone: links in text are underlined; states have icons or text too.
- Images have `alt` (empty for decoration); icon-only buttons have `aria-label`.
- Text resizes to 200% and reflows at 320px width without horizontal scrolling.

Dynamic behavior
- Copy buttons announce the result (`aria-live="polite"`).
- Tabs: `role="tablist"`, `role="tab"` with `aria-selected`, arrow keys move between tabs.
- Disclosure: prefer `<details>`/`<summary>`; custom ones use `aria-expanded`.

## Performance budgets

Core Web Vitals, mobile, lab measurement:

| Metric | Budget |
|---|---|
| Largest Contentful Paint | ≤ 2.5 s |
| Cumulative Layout Shift | ≤ 0.1 |
| Interaction to Next Paint | ≤ 200 ms |

Aim for Lighthouse 95 or higher in all four categories on the home page, a detail page and a
long text page.

How to stay inside them:
- **Cache pages.** `cache.pages: 'next-isr'` (Next.js) or `'cdn'` (SvelteKit, Express) serves
  repeat visits without rendering or database reads.
- **Server-render content.** Content arrives in the HTML; no client-side fetching of the page's
  own content.
- **Little client JavaScript.** Interactivity by event delegation or small islands; CSS over JS
  for animation; native elements over widget libraries.
- **Fonts.** At most two or three families, `font-display: swap`, subset, self-hosted or through
  the framework's font loader, with metric-compatible fallbacks to avoid layout shift.
- **Images.** Always `width` and `height` (or `aspect-ratio`); the right preset from
  `/api/media/<id>/image?preset=…` (format is negotiated: AVIF, then WebP); `loading="lazy"`
  below the fold, never on the LCP image.
- **No layout shift** from late content: reserve space for banners, embeds and anything the
  client adds.

## Motion

- Durations 150–300 ms; ease-out for entering, ease-in-out for moving. Animate `transform` and
  `opacity` only.
- Motion explains a change (a panel opening, focus moving, a diagram building up). No looping
  decoration near text.
- Respect reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- Scroll-triggered reveals start visible when JavaScript or motion is off; never hide content
  until an animation runs.

## Pre-release checklist

- [ ] Both themes and the system state, no flash on load with a stored choice.
- [ ] Phone (360px), tablet and desktop widths; no horizontal scroll.
- [ ] Keyboard-only pass through every page type; visible focus throughout.
- [ ] Automated check (axe or Lighthouse) with no violations; contrast verified in both themes.
- [ ] Budgets met on the home page, a detail page and a long text page.
- [ ] Reduced motion honored.
- [ ] Every page has a unique `<title>` and meta description from its content, and JSON-LD
      where relevant (the `seo` skill).
- [ ] A missing document answers a real 404 page, and unpublished content never shows.
