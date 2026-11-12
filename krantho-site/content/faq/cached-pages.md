---
title: 'What happens to cached pages when an editor publishes?'
topic: product
order: 7
docs-page: rendering-modes
status: published
---

With page caching on, every page records cache tags for what it read — the document, the lists it shows, the site's globals — and every committed write announces what it changed. Publishing invalidates the tags that change affects, so only the pages that show it are refreshed: in Next's cache under `next-isr`, or with a purge at the CDN under `cdn`.

A save changes nothing visitors see, so it refreshes nothing. Without page caching (`none`, the default), every request renders the page from the published version.
