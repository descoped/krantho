---
title: 'Rendering and page caching'
description: 'Pages render on the server and stay cached until an editor changes something they show — in Next.js, or at the CDN in front of SvelteKit and Express.'
benefit: 'Visitors get cached pages, and editors see their changes without waiting for a timeout.'
order: 4
icon: cache
proof-sample: cache-pages
docs-page: rendering-modes
status: published
---

## Problem

Server-rendered pages that read the database on every visit cost a render and a query per request. Caching them for a fixed time means an editor publishes and then waits, or asks a developer to clear a cache. Rebuilding the whole site on each change is slow, and ties editing to your build.

## Approach

Krantho knows two things that make caching precise instead of timed. Every page read records cache tags for what it read: a document, a collection list, an SEO configuration, the site. Every committed write announces what it changed, and `invalidationsFor()` in `@krantho/core` maps that change to the tags it invalidates. A cached page is kept until something it shows changes, and then only the pages that show it are refreshed.

One configuration leaf, `cache.pages`, picks the strategy:

- **`none`** renders every request. This is the default.
- **`next-isr`** keeps each Next.js page, rendered on its first request, in Next's cache until a change invalidates its tags. Behind CloudFront or Cloud CDN, the API also purges the CDN after a change.
- **`cdn`** lets the CDN in front of a SvelteKit or Express site keep each page. The page carries its tags in a header, and a change purges those tags at Vercel, CloudFront or Google Cloud CDN.

Several Next.js instances without a cache the platform shares can keep Next's cache in the site's own database, SQLite or Postgres, with `cache.shared: 'database'`. A page one instance rendered is served by the others, and an invalidation on one reaches all of them.

A save changes nothing that visitors see, so it refreshes nothing.

## Proof

The build never reads the database. Content routes are dynamic segments that render on their first request:

```tsx title="app/(site)/[[...slug]]/page.tsx"
export const revalidate = false

export function generateStaticParams(): { slug: string[] }[] {
  return []
}
```

This site runs this way: a Next.js app on Vercel with `cache.pages: 'next-isr'`. Each page is rendered once, served from the cache, and refreshed when its content changes in Studio.

## Limits

- `next-isr` is for Next.js; `cdn` is for SvelteKit and Express.
- The CDN strategies need the provider's setup on the host side, such as a cache policy that honors the origin's headers. The page caching guide lists what each provider needs.
- A failed CDN purge never fails the write. It is logged, and the page expires after its CDN lifetime, one day by default.
- Content files that a deploy ships are not reliably purged at a CDN. Purge the CDN as a deploy step when content files change.
- A page carries at most 50 cache tags. Beyond that, document tags give way to their collection's tag, so a page may refresh more often than it needs to.
