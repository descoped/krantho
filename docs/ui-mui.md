# @krantho/ui-mui

Material UI adapter for the krantho CMS component layer. Provides `CMSText`, `CMSMarkdown`, and `CMSImage` as client-side React components backed by MUI's `Typography` and `Box` primitives, wired to the `@krantho/core` semantic style system.

## Context

The krantho architecture separates UI rendering from content processing through an adapter pattern. MUI is the first-class adapter for projects already using Material UI. This package exists so that MUI-specific rendering logic stays out of `@krantho/core`, keeping the core UI-agnostic and the MUI dependency optional.

See [docs/tailwind.md](./tailwind.md) for the Tailwind CSS alternative and [docs/svelte.md](./svelte.md) for the Svelte adapter.

## Rationale

- **Thin wrapper, not a framework.** Each component delegates directly to a single MUI primitive (`Typography` or `Box`). No abstraction layers on top of MUI.
- **Client-only.** All components are marked `'use client'` because MUI requires a browser runtime for Emotion styling. Server-side rendering uses `@krantho/core`'s HTML adapter instead.
- **Semantic style bridging.** Props like `variant`, `color`, and `align` use `@krantho/core`'s `SemanticStyle` type, so the same content model drives both MUI and non-MUI renderers.
- **Peer dependency on MUI.** `@mui/material` is a peer dependency, not bundled. Consumers control the MUI version.

## Architecture

```
@krantho/ui-mui
├── index.ts           # Barrel exports (components + types)
├── types.ts           # Prop interfaces extending SemanticStyle
├── CMSText.tsx        # Typography wrapper
├── CMSMarkdown.tsx    # Box wrapper for markdown content
└── CMSImage.tsx       # Box + img wrapper with responsive defaults
```

All three components accept a `slug` and `field` (or `section`) prop to identify content. The rendering layer uses MUI primitives; content resolution is handled upstream by the content engine.

## API Reference

### `CMSText`

Renders a single text field as MUI `Typography`.

```typescript
interface MUICMSTextProps {
  slug: string
  field: string
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body1' | 'body2' | 'caption'
  color?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  fallback?: string
  className?: string
  component?: string
  gutterBottom?: boolean
}
```

Defaults: `variant = 'body1'`, `color = 'inherit'`, `fallback = ''`.

### `CMSMarkdown`

Renders a markdown section as MUI `Box`.

```typescript
interface MUICMSMarkdownProps {
  slug: string
  section?: string
  className?: string
}
```

### `CMSImage`

Renders an image inside an MUI `Box` with responsive layout defaults.

```typescript
interface MUICMSImageProps {
  slug: string
  field: string
  alt?: string
  width?: number
  height?: number
  lazy?: boolean
  className?: string
}
```

Defaults: `alt = ''`, `lazy = true`. The outer `Box` is set to `position: relative, width: 100%`. The inner `img` uses `object-fit: cover`.

## Usage

### Installation

```bash
pnpm add @krantho/ui-mui @mui/material @emotion/react @emotion/styled
```

### Basic usage

```typescript
import { CMSText, CMSMarkdown, CMSImage } from '@krantho/ui-mui'

// Text field
<CMSText slug="home" field="page-title" variant="h1" gutterBottom />

// Markdown section
<CMSMarkdown slug="about" section="intro" />

// Image
<CMSImage slug="home" field="hero-image" alt="Hero banner" />
```

### With custom styling

```typescript
<CMSText
  slug="services"
  field="service-1-title"
  variant="h3"
  color="primary"
  align="center"
  className="my-custom-class"
/>
```

## Dependencies

| Type | Package | Version |
|------|---------|---------|
| Workspace | `@krantho/core` | `workspace:*` |
| Peer | `@mui/material` | `>=7.0.0` |
| Peer | `react` | `>=19.0.0` |
| Dev | `@emotion/react` | `^11.14.0` |
| Dev | `@emotion/styled` | `^11.14.1` |
| Dev | `@types/react` | `^19.2.14` |
| Dev | `typescript` | `^6.0.2` |
