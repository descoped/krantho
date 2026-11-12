# Tokens and themes

## Contents

- Token set
- Three states, no flash
- The theme switch
- Images and diagrams in two themes
- Tailwind, MUI and component libraries

## Token set

Define tokens once on `:root`, then redefine only the color tokens per theme. Components read
tokens; nothing else holds a raw color, size or duration.

```css
:root {
  /* Type: a modular scale, fluid at the top end */
  --font-text: ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.25rem;
  --text-2xl: clamp(1.75rem, 1.4rem + 1.4vw, 2.25rem);
  --text-4xl: clamp(2.5rem, 1.7rem + 3.6vw, 4.25rem);
  --leading-tight: 1.15;
  --leading-body: 1.65;

  /* Space on a 4px grid */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-4: 1rem;
  --space-6: 2rem;
  --space-8: 4rem;

  /* Shape, layout, motion */
  --radius-md: 10px;
  --width-content: 72rem;
  --width-prose: 44rem;
  --gutter: clamp(1rem, 0.5rem + 2vw, 2rem);
  --duration-fast: 150ms;
  --duration-base: 240ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);

  /* Color: light */
  color-scheme: light;
  --color-bg: #fbfbf9;
  --color-surface: #ffffff;
  --color-text: #16181d;
  --color-text-muted: #4a4f5a;
  --color-border: #d9dbe0;
  --color-accent: #0b6b62;
  --color-accent-contrast: #ffffff;
  --color-focus: #0b6b62;
}

/* Dark follows the system unless the visitor chose light */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
    --color-bg: #0d1117;
    --color-surface: #151b24;
    --color-text: #e8eaee;
    --color-text-muted: #a9b0bc;
    --color-border: #2b3340;
    --color-accent: #5fd3c4;
    --color-accent-contrast: #0d1117;
    --color-focus: #5fd3c4;
  }
}

/* An explicit dark choice wins over a light system */
:root[data-theme='dark'] {
  color-scheme: dark;
  /* the same dark values as above */
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font: var(--text-base) / var(--leading-body) var(--font-text);
}
```

The values are placeholders: derive the palette from the brand. Check every text/background pair
used in the UI against 4.5:1 (3:1 for large text and UI boundaries) in **both** themes.

## Three states, no flash

The theme has three states: **system** (no attribute; follows `prefers-color-scheme`),
**light** and **dark** (`data-theme` on `<html>`). The choice is stored in `localStorage`.

Why an inline script: a krantho page cached with `next-isr` or at a CDN is one HTML document
shared by every visitor, so the server cannot know a visitor's choice. The stored choice must be
applied by a small blocking script in `<head>`, before the body paints — anything later flashes
the wrong theme.

```html
<script>
  (function () {
    try {
      var t = localStorage.getItem('theme')
      if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
    } catch (e) {}
  })()
</script>
```

- Keep it tiny, synchronous and free of imports; wrap storage access in `try` (private modes
  throw).
- The same technique carries any other per-visitor display preference (a preferred code
  language, a dense layout).
- In Next.js, render it in the root layout's `<head>` with `dangerouslySetInnerHTML` and add
  `suppressHydrationWarning` to `<html>`, since the attribute differs from the server HTML. In
  SvelteKit, put it in `src/app.html`. In a Vite/Express app, in `index.html`.
- Set `<meta name="theme-color">` per scheme (`media="(prefers-color-scheme: dark)"`) so the
  browser chrome matches.

## The theme switch

- A button (or a three-option radio group) that cycles or picks system, light, dark; its
  accessible name says the current state ("Theme: system").
- On change: set or remove `data-theme`, write or remove the stored value. No reload.
- Icons need text alternatives; the switch is reachable by keyboard and has a visible focus ring.

## Images and diagrams in two themes

- Prefer SVG with `currentColor` and token-driven fills, so diagrams follow the theme.
- Photos: avoid pure white backgrounds that glare in dark mode; a subtle border or a surface
  behind them helps.
- `<picture>` with `media="(prefers-color-scheme: dark)"` only follows the system, not an explicit
  choice; for themed raster images, render both and hide one with `[data-theme]` selectors.

## Tailwind, MUI and component libraries

- Tailwind v4: expose the tokens to utilities with `@theme` (for example
  `--color-surface: var(--color-surface)` under a distinct utility name). Colors that come from
  tokens already switch with the three states, so `dark:` variants are rarely needed; if you use
  them, redefine the variant with `@custom-variant` so it matches `[data-theme=dark]` and not only
  the media query.
- MUI: use its CSS theme variables with a color-scheme selector on the same `data-theme`
  attribute, and apply the stored choice before paint as above; do not let a cached page render
  the scheme on the server.
- Whatever the library, the source of truth stays the tokens on `:root`.
