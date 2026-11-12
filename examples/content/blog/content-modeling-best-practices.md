---
title: Content Modeling Best Practices with defineCollection
date: '2026-03-20'
author: Acme Editorial Team
tags:
  - tutorial
  - schema
  - best-practices
excerpt: Learn how to model your content types effectively using Zod schemas and the defineCollection API.
status: published
---

Good content modeling is the foundation of a maintainable CMS. With krantho's `defineCollection()` API, you declare your content types upfront with full TypeScript type safety.

## Start Simple

Begin with the minimum viable schema. You can always add fields later — krantho validates at load time, so new optional fields are backward compatible.

```typescript
const pages = defineCollection({
  name: 'pages',
  source: 'filesystem',
  directory: 'content/pages',
  schema: z.object({
    title: z.string(),
    status: z.enum(['draft', 'published']).default('published'),
  }),
})
```

## Use Defaults Wisely

Defaults reduce friction for content authors. A `status` field with `default('draft')` means new content starts as a draft — you must explicitly publish it.

## Separate Concerns

Keep filesystem-mastered content (pages, services) separate from database-mastered content (blog posts, news). This gives you the best of both worlds: version-controlled static pages and a dynamic publishing workflow for articles.
