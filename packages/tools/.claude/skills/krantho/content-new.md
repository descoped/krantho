# /kt-new <collection> <title>

Create new content from a collection's Zod schema.

## Steps

1. Read `content.config.ts` to find the collection definition
2. If collection not found, list available collections and ask user to choose
3. Generate a slug from the title (lowercase, hyphens, no special chars)
4. For blog collection: prefix with today's date (`YYYY-MM-DD-slug`)
5. Read the collection's Zod schema to determine required and optional fields
6. Create the markdown file with:
   - All required frontmatter fields populated with sensible defaults
   - Optional fields included as YAML comments
   - `status: draft` (always starts as draft)
   - Empty markdown body with heading scaffold
7. Run validation on the created file to confirm it's valid

## Slug Generation

```
"Launching Krantho" → "launching-krantho"
"My First Blog Post!" → "my-first-blog-post"
"SEO Best Practices (2026)" → "seo-best-practices-2026"
```

## Example

```
User: /kt-new blog "Launching Krantho"

Creates: content/blog/2026-03-28-launching-krantho.md

---
title: Launching Krantho
date: '2026-03-28'
author: ""
status: draft
# tags: []
# excerpt: ""
---

# Launching Krantho

<!-- Write your content here -->
```
