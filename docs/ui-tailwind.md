# @krantho/ui-tailwind

Tailwind CSS adapter for the krantho CMS component layer. Maps `@krantho/core`'s semantic style tokens (variant, color, align, weight) to Tailwind utility classes and renders them as plain HTML elements. Zero runtime UI framework dependency beyond React.

## Context

Not every project uses Material UI. This package provides the same CMS component API (`CMSText`, `CMSMarkdown`, `CMSImage`) but outputs semantic HTML styled with Tailwind utilities instead of MUI primitives. It exists as a lightweight alternative when MUI's runtime overhead is unwanted.

See [docs/mui.md](./mui.md) for the MUI adapter and [docs/svelte.md](./svelte.md) for the Svelte adapter.

## Rationale

- **Pure utility classes.** No runtime style engine. The `tailwindClasses()` function maps semantic tokens to Tailwind class strings at render time. Tailwind's compiler tree-shakes unused classes at build time.
- **Semantic HTML elements.** `variantToTag()` maps variants to the correct HTML tag (`h1`-`h6`, `p`, `span`), preserving document outline without wrapper divs.
- **Composable class builder.** The `tailwindClasses` utility is exported for use outside of CMS components, enabling consistent styling across custom components.
- **Client-only.** Components are `'use client'` to match the React client component model. Server rendering uses `@krantho/core`'s HTML adapter.

## Architecture

```
@krantho/ui-tailwind
├── index.ts           # Barrel exports (components + types + utils)
├── utils.ts           # tailwindClasses() and variantToTag() mapping functions
├── CMSText.tsx        # Semantic element with computed Tailwind classes
├── CMSMarkdown.tsx    # div.prose wrapper for markdown content
└── CMSImage.tsx       # Responsive img with Tailwind classes
```

### Style mapping tables

| Variant | Tailwind classes | HTML tag |
|---------|-----------------|----------|
| `h1` | `text-4xl font-bold tracking-tight` | `<h1>` |
| `h2` | `text-3xl font-semibold tracking-tight` | `<h2>` |
| `h3` | `text-2xl font-semibold` | `<h3>` |
| `h4` | `text-xl font-semibold` | `<h4>` |
| `h5` | `text-lg font-medium` | `<h5>` |
| `h6` | `text-base font-medium` | `<h6>` |
| `body1` | `text-base` | `<p>` |
| `body2` | `text-sm` | `<p>` |
| `caption` | `text-xs text-gray-500` | `<span>` |

| Color | Class | Weight | Class |
|-------|-------|--------|-------|
| `primary` | `text-blue-600` | `light` | `font-light` |
| `secondary` | `text-gray-600` | `regular` | `font-normal` |
| `error` | `text-red-600` | `medium` | `font-medium` |
| `warning` | `text-amber-600` | `bold` | `font-bold` |
| `info` | `text-sky-600` | | |
| `success` | `text-green-600` | | |
| `inherit` | *(none)* | | |

## API Reference

### `CMSText`

Renders a text field as a semantic HTML element with Tailwind classes.

```typescript
interface TailwindCMSTextProps {
  slug: string
  field: string
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body1' | 'body2' | 'caption'
  color?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  weight?: 'light' | 'regular' | 'medium' | 'bold'
  fallback?: string
  className?: string
}
```

Defaults: `fallback = ''`. The rendered element tag is derived from `variant` via `variantToTag()`.

### `CMSMarkdown`

Renders a markdown section inside a `<div>` with the `prose` class (for Tailwind Typography plugin compatibility).

```typescript
interface TailwindCMSMarkdownProps {
  slug: string
  section?: string
  className?: string
}
```

### `CMSImage`

Renders a responsive `<img>` element with `w-full h-auto object-cover` defaults.

```typescript
interface TailwindCMSImageProps {
  slug: string
  field: string
  alt?: string
  width?: number
  height?: number
  lazy?: boolean
  className?: string
}
```

Defaults: `alt = ''`, `lazy = true`.

### `tailwindClasses`

Utility function that composes a Tailwind class string from semantic style tokens. Exported for reuse.

```typescript
function tailwindClasses(style: Partial<SemanticStyle>, className?: string): string
```

Concatenates classes for `variant`, `color`, `align`, `weight`, and any custom `className`. Filters out empty strings.

### `variantToTag`

Maps a semantic variant to its HTML tag. Returns `'p'` if the variant is unknown or undefined.

```typescript
function variantToTag(variant?: string): string
```

## Usage

### Installation

```bash
pnpm add @krantho/ui-tailwind
# Tailwind CSS must already be configured in the project
```

### Basic usage

```typescript
import { CMSText, CMSMarkdown, CMSImage } from '@krantho/ui-tailwind'

<CMSText slug="home" field="page-title" variant="h1" />
<CMSMarkdown slug="about" section="intro" className="max-w-prose" />
<CMSImage slug="home" field="hero-image" alt="Hero" />
```

### Using the utility directly

```typescript
import { tailwindClasses, variantToTag } from '@krantho/ui-tailwind'

const classes = tailwindClasses({ variant: 'h2', color: 'primary', weight: 'bold' })
// => 'text-3xl font-semibold tracking-tight text-blue-600 font-bold'

const tag = variantToTag('h2')
// => 'h2'
```

## Dependencies

| Type | Package | Version |
|------|---------|---------|
| Workspace | `@krantho/core` | `workspace:*` |
| Peer | `react` | `>=19.0.0` |
| Peer | `tailwindcss` | `>=4.0.0` |
| Dev | `@types/react` | `^19.2.14` |
| Dev | `typescript` | `^6.0.2` |
