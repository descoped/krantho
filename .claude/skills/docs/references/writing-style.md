# Writing Style Guide

## Voice

Write as a knowledgeable colleague explaining over coffee — direct, helpful, no filler. The reader is a developer who chose to evaluate krantho. Respect their time.

## Rules

- **Second person**: "you", not "the developer" or "one"
- **Active voice**: "Install the package" not "The package should be installed"
- **Present tense**: "This renders a heading" not "This will render a heading"
- **Short sentences**: If a sentence has a comma, consider splitting it
- **No jargon without context**: First use of a term like "frontmatter" gets a one-line explanation

## Code examples

Every code example must:
- Be self-contained (includes imports)
- Use `@krantho/<name>` imports (never relative paths)
- Be correct TypeScript (mentally trace the types)
- Show the minimal code needed (no extra configuration)

Format:
```tsx
// Brief comment explaining what this does
import { CMSTextServer } from '@krantho/ui-react/server'

export default async function Page() {
  return <CMSTextServer slug="home" field="page-title" variant="h1" />
}
```

## Headings

- H1: Page title (one per page, set in frontmatter)
- H2: Major sections
- H3: Subsections within H2
- Never skip levels (no H2 → H4)

## Links

- Link to other docs pages by slug: `[Installation](/docs/installation)` — docs URLs are flat.
- Link to product pages where the reader is deciding: `[Features](/features/seo)`.
- Link to source code only for "view source" references, not inline.

## Callouts

GitHub-style blockquote callouts, rendered by `krantho-site/lib/markdown.ts`. Use them sparingly:

```markdown
> [!NOTE]
> Useful context that isn't critical.

> [!TIP]
> A helpful shortcut or best practice.

> [!CAUTION]
> Something that will break or confuse if done wrong.

> [!SINCE] 0.2.0
> The feature arrived in this version.
```

## Page length

- Getting started pages: under 200 lines
- Guide pages: under 300 lines
- Reference pages: as long as needed (but use collapsible sections)
- If a page exceeds 400 lines, split it
