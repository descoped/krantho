---
title: Page cache
definition: How rendered pages are kept between requests, chosen by cache.pages as none, next-isr or cdn.
docs-page: rendering-modes
status: published
---

With `none`, every request renders the page. With `next-isr`, Next.js keeps each page until a content change invalidates it; with `cdn`, a CDN in front of a SvelteKit or Express site keeps each page until a change purges it. Every committed write announces what it changed, and krantho maps that change to the pages that read it.
