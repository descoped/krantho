# Fields: Zod schema → Studio form

## Contents

- Media
- References
- Enums
- Numbers and ordering
- Dates
- Strings with structure
- Status
- Well-known field names
- Runtime fields
- Validation

Studio builds each form from the collection's schema, converted to JSON Schema. The first
matching rule picks the input:

| Zod | Studio input | Stored value |
|---|---|---|
| `z.string().describe('media')` | media picker (upload or choose from the library) | the media item id |
| `z.string().describe('ref:<collection>')` | reference picker listing that collection's documents by title | the referenced document's slug |
| `z.enum([...])` | select | one of the values |
| `z.boolean()` | checkbox | `true` / `false` |
| `z.number()` | number input | a number |
| `z.array(z.string())` | tag input | a string array |
| `z.string().datetime()` or a date format | date picker | an ISO string |
| a string whose name contains `color` | color picker | a color string |
| `z.string().max(n)` with `n > 200`, or a name containing `description`, `ingress` or `intro` | textarea | a string |
| any other string | text input (`url`, `email` input types when the name contains `url`/`link`/`href` or `email`) | a string |

Field order in `z.object({...})` is the order of the form. `.optional()` fields may stay empty;
`.default(x)` fills `x` on import and on save.

## Media

```ts
'hero-image': z.string().describe('media').optional(),
'hero-image-alt': z.string().optional(),
```

The field stores the media id. Render it through the image endpoint, which picks the format from
the browser and follows a replaced image:

```tsx
<img src={`/api/media/${id}/image?preset=lg`} alt={alt} width={1024} height={576} />
```

Presets: `xs` 48, `sm` 96, `md` 256 (default), `lg` 512, `xl` 1024, `full` (pixel widths, set by
`media.image.presets`). Add `aspect=16:9` to crop to a ratio. Media must be enabled
(`media.provider`).

## References

```ts
author: z.string().describe('ref:people'),
related: z.array(z.string()).optional(), // several references: a tag input of slugs
```

A reference stores a slug. The page template resolves it with
`getCMSContent('<collection>', slug)` and handles a missing or unpublished target (render
nothing, not an error). The collection name after `ref:` must be word characters only.

## Enums

Short, stable values (`beginner`, `intermediate`). Labels shown to visitors belong in the page
template or in content, not in the enum value. Renaming a value means migrating documents that
use it.

## Numbers and ordering

`order: z.number().default(99)` gives list collections an editor-controlled order; sort by it
in the page template, then by title. Leave gaps (10, 20, 30) so editors can insert.

## Dates

Store dates as strings: `date: z.string()`. In frontmatter, **quote them**
(`date: '2026-09-30'`): unquoted YAML dates parse as date objects and fail a string schema, and
the file is skipped on import.

## Strings with structure

A short list whose items have two parts can be a string array with a separator the template
parses, such as navigation links `"Label|/href"`. When items grow a third part or need their own
form, make them a collection.

## Status

```ts
status: z.enum(['draft', 'published']).default('published'),
```

krantho keeps the field equal to the document's publication state — `published` while a
version is live, `draft` while none is — so a value sent with a save is not used. In a markdown
file it decides whether the import is live. Studio's status chip also offers **Archive**.
Only the live version of a document is ever rendered; see the `content` skill for the save and
publish flow.

## Well-known field names

krantho's SEO and Studio recognize these names; prefer them over inventing synonyms:

| Name | Read by |
|---|---|
| `title` | titles, reference picker labels, SEO |
| `description` | cards, meta description fallback |
| `meta-description`, `meta-description-<section>` | meta description |
| `og-image`, `image`, `hero-image` | Open Graph and Schema.org image |
| `og-title`, `og-description` | Open Graph |
| `canonical-url` | canonical link |
| `robots-index` | `false` keeps the document out of the sitemap; Studio's Data mode sets it under Indexing |
| `author`, `date`, `published-date` | Schema.org authorship and dates |
| `order` | list order (convention) |
| `route` | the document's path in its JSON-LD graph when it differs from the default |

## Runtime fields

Admins can add fields in Studio under Setup › Collections & schema → **Fields** (types: string, number, boolean, date,
enum, url, email, textarea, color, reference, each optionally an array). They are additive:
they never change or remove a code-defined field. Move a runtime field into the Zod schema once
it is part of the design; `GET /api/schema/<collection>/export` prints the merged schema as Zod.

## Validation

Every save through Studio or API is validated against the merged schema (422 with the
issues). Markdown files are validated on import; a file that fails is skipped with a warning in
the server log naming each issue. Test a new schema by importing its sample files into a fresh
database and reading the log.
