---
title: Semantic styles
description: The semantic style tokens krantho's text components take — variant, color, align, weight and size — and how each UI package renders them.
area: reference
order: 30
level: beginner
stacks: [next, sveltekit, express]
prerequisites: [first-page]
related: [package-ui-react, package-core, templates, content-fields]
status: published
---

krantho's text components take semantic style tokens instead of CSS classes or framework-specific props. You pass the tokens to a component, and the UI package you use translates them into its own output — HTML classes, MUI props, or another target.

## SemanticStyle

```ts
interface SemanticStyle {
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body1' | 'body2' | 'caption'
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' | 'inherit'
  align?: 'left' | 'center' | 'right' | 'justify'
  weight?: 'light' | 'regular' | 'medium' | 'bold'
  size?: 'small' | 'medium' | 'large'
}
```

Every property is optional. An omitted property uses the UI package's default.

## Usage

`SemanticStyle` is exported as a type from `@krantho/core`. The text components take its tokens as individual props:

```tsx title="app/page.tsx"
import { CMSTextServer } from '@krantho/ui-react/server'

export default async function Page() {
  return (
    <>
      <CMSTextServer collection="pages" slug="home" field="title" variant="h1" color="primary" weight="bold" />
      <CMSTextServer collection="pages" slug="home" field="description" variant="body1" align="center" />
    </>
  )
}
```

## Variant

The typographic role of the text. It decides the HTML element or component used.

| Value | Output with `@krantho/ui-react` | Use for |
|-------|---------------|---------|
| `h1` | `<h1>` | Page title. One per page. |
| `h2` | `<h2>` | Section headings. |
| `h3` | `<h3>` | Subsection headings. |
| `h4` | `<h4>` | Minor headings. |
| `h5` | `<h5>` | Small headings. |
| `h6` | `<h6>` | Smallest headings. |
| `body1` | `<p>` | Standard body text. |
| `body2` | `<p>` | Secondary body text, descriptions, supporting content. |
| `caption` | `<span>` | Captions, labels, helper text. |

Without a variant, `@krantho/ui-react` renders a `<p>`. A `component` prop overrides the element when the markup needs a different one than the role suggests.

## Color

The semantic color intent. Your theme decides the actual colors.

| Value | Intent |
|-------|--------|
| `primary` | Main brand color. Headings and key content. |
| `secondary` | Supporting color. Secondary information. |
| `error` | Error state. Validation messages and alerts. |
| `warning` | Warning state. Cautionary information. |
| `info` | Informational state. Tips and neutral notices. |
| `success` | Success state. Confirmations and positive feedback. |
| `inherit` | Takes the color of the parent element. |

## Align

Text alignment.

| Value | Effect |
|-------|--------|
| `left` | Aligns text to the left edge. |
| `center` | Centers text horizontally. |
| `right` | Aligns text to the right edge. |
| `justify` | Stretches text to fill the full width. |

## Weight

Font weight.

| Value | Typical CSS weight | Use for |
|-------|-------------------|---------|
| `light` | 300 | De-emphasized text, large display type. |
| `regular` | 400 | Standard body text. |
| `medium` | 500 | Slightly emphasized text, subheadings. |
| `bold` | 700 | Strong emphasis, headings, key phrases. |

## Size

A relative size modifier applied on top of the variant.

| Value | Effect |
|-------|--------|
| `small` | Smaller than the variant's default size. |
| `medium` | The variant's default size. |
| `large` | Larger than the variant's default size. |

## How each UI package renders them

`@krantho/ui-react` renders the tokens as CSS classes next to the component's base class:

```html
<h1 class="cms-text cms-variant-h1 cms-color-primary cms-weight-bold">Page Title</h1>
```

The classes follow one pattern — `cms-variant-*`, `cms-color-*`, `cms-align-*`, `cms-weight-*`, `cms-size-*` — and the package ships no stylesheet for them. Your site's CSS gives them their look, which keeps the markup semantic and the design yours.

`@krantho/ui-svelte` writes the same `cms-*` classes. Its `CMSText` defaults to `body1`, so it always carries a variant class.

`@krantho/ui-tailwind` translates the tokens into Tailwind utility classes — `variant="h1"` becomes `text-4xl font-bold tracking-tight`, `color="primary"` becomes `text-blue-600`, `weight="bold"` becomes `font-bold`. It takes no `size`.

`@krantho/ui-mui` maps `variant`, `color` and `align` to the props of MUI's `Typography`. It takes no `weight` or `size`; your MUI theme decides both:

```tsx
<Typography variant="h1" color="primary">Page Title</Typography>
```

The tokens mean the same thing in every UI package, and each package translates the ones it supports into its own output.
