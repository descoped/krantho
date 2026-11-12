# @krantho/ui-svelte

Svelte 5 adapter for the krantho CMS component layer. Provides `CMSText`, `CMSMarkdown`, and `CMSImage` as Svelte components using runes (`$props`, `$derived`) and `<svelte:element>` for dynamic tag rendering. CSS classes use a `cms-*` prefix convention for framework-agnostic styling.

## Context

The krantho architecture supports multiple UI frameworks through per-framework adapter packages. This package brings CMS components to SvelteKit projects without requiring React. It follows the same prop contract as `@krantho/ui-mui` and `@krantho/ui-tailwind` but renders native Svelte components.

See [docs/mui.md](./mui.md) and [docs/tailwind.md](./tailwind.md) for the React-based adapters.

## Rationale

- **Svelte 5 runes only.** Uses `$props<T>()` for typed props and `$derived` for computed values. No legacy `export let` or stores.
- **Semantic CSS classes.** Instead of mapping to Tailwind utilities or MUI tokens, components emit BEM-style classes (`cms-text`, `cms-variant-h1`, `cms-color-primary`). This keeps the adapter CSS-framework-agnostic -- consumers style with their preferred approach.
- **Dynamic elements.** `CMSText` uses `<svelte:element this={tag}>` to render the correct HTML tag based on variant, maintaining proper document outline.
- **Build tooling not yet configured.** The package uses placeholder build/typecheck scripts. Production builds will use `svelte-package` and `svelte-check`.

## Architecture

```
@krantho/ui-svelte
├── index.ts              # Barrel exports (re-exports default from each .svelte)
├── CMSText.svelte        # Dynamic-tag text with variant/color class mapping
├── CMSMarkdown.svelte    # div wrapper for rendered markdown (a body or a section)
├── CMSImage.svelte       # Responsive img element
└── seo/
    ├── JsonLd.svelte         # Base JSON-LD script tag (XSS-safe)
    ├── BreadcrumbJsonLd.svelte  # BreadcrumbList structured data
    └── FAQSchema.svelte      # FAQPage structured data
```

### CSS class convention

Components generate classes following the pattern `cms-{component}` plus modifier classes:

| Class | Applied when |
|-------|-------------|
| `cms-text` | Always on `CMSText` |
| `cms-variant-{variant}` | When `variant` prop is set |
| `cms-color-{color}` | When `color` prop is set |
| `cms-markdown` | Always on `CMSMarkdown` |
| `cms-image` | Always on `CMSImage` |

### Variant to tag mapping

Same mapping as other adapters: `h1`-`h6` map to their HTML equivalents, `body1`/`body2` map to `<p>`, `caption` maps to `<span>`. Unknown variants fall back to `<p>`.

## API Reference

The components take values, not slugs: the page's `load` function reads the document through the content loader and passes what it rendered. Each one also takes the document as `doc` (a `MarkedDocument` from `@krantho/core/marks`: `{ collection, slug, preview }`) and marks what it renders for Studio's Live mode — only when `doc.preview` is true, so visitors get the same markup either way (see [core.md](core.md#marks)).

### `CMSText`

Dynamic-tag text component.

```typescript
// Props (via $props)
{
  text: string
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body1' | 'body2' | 'caption' // default: 'body1'
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' | 'inherit'
  align?: 'left' | 'center' | 'right' | 'justify'
  weight?: 'light' | 'regular' | 'medium' | 'bold'
  size?: 'small' | 'medium' | 'large'
  component?: string // overrides the tag
  class?: string     // default: ''
  doc?: MarkedDocument
  field?: string     // with doc: marked with kranthoField(doc, field)
}
```

Renders `<svelte:element this={tag}>` where `tag` is `component`, or derived from `variant`.

### `CMSMarkdown`

Rendered markdown container.

```typescript
{
  html: string
  class?: string     // default: ''
  doc?: MarkedDocument
  section?: string   // html is this ## section: the div is marked with kranthoSection(doc, section)
  body?: string      // html is a whole body rendered from this markdown: markBodySections(html, body, doc)
}
```

Renders a `<div class="cms-markdown {class}">` around `{@html}`.

### `CMSImage`

Responsive image element.

```typescript
{
  src: string
  alt?: string       // default: ''
  width?: number
  height?: number
  lazy?: boolean     // default: true
  class?: string     // default: ''
  doc?: MarkedDocument
  field?: string     // with doc: marked with kranthoField(doc, field)
}
```

Renders `<img>` with `loading="lazy"` by default and `class="cms-image {class}"`.

### SEO Components

#### `JsonLd`

Base JSON-LD component. Renders a `<script type="application/ld+json">` tag inside `<svelte:head>`. Sanitizes `<` to `\u003c` for XSS protection.

```svelte
<script lang="ts">
import { JsonLd } from '@krantho/ui-svelte'
</script>

<JsonLd data={{ '@context': 'https://schema.org', '@type': 'Organization', name: 'Example' }} />
```

#### `BreadcrumbJsonLd`

Renders a BreadcrumbList JSON-LD block from a pathname.

#### `FAQSchema`

Renders a FAQPage JSON-LD block for a target route.

## Usage

### Installation

```bash
pnpm add @krantho/ui-svelte
```

### In a SvelteKit page

`load` returns the rendered document with its `doc` (`{ collection, slug, preview: await loader.isPreview() }`) and markdown `body`, as `examples/sveltekit-tailwind/src/lib/cms.ts` does:

```svelte
<script lang="ts">
import { CMSText, CMSMarkdown } from '@krantho/ui-svelte'

let { data } = $props()
</script>

<CMSText text={String(data.fields['title'] ?? '')} variant="h1" doc={data.doc} field="title" />
<CMSMarkdown html={data.html} class="prose" doc={data.doc} body={data.body} />
<CMSMarkdown html={data.sections['Our Team'] ?? ''} doc={data.doc} section="Our Team" />
```

Own markup marks with the same helpers: `<h1 {...kranthoField(data.doc, 'title')}>`.

### Styling the CSS classes

```css
/* App-level styles */
.cms-variant-h1 {
  font-size: 2.5rem;
  font-weight: 700;
}

.cms-color-primary {
  color: var(--color-primary);
}

.cms-image {
  width: 100%;
  height: auto;
  object-fit: cover;
}
```

## Dependencies

| Type | Package | Version |
|------|---------|---------|
| Workspace | `@krantho/core` | `workspace:*` |
| Peer | `svelte` | `>=5.0.0` |
